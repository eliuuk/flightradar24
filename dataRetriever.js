const fs = require('fs');
const request = require('request');
const _ = require('lodash');
const parseArguments = require('minimist');

class Flight {
    constructor(flightDetails) {
        this.identification = flightDetails.identification;
        this.airline = flightDetails.airline;
        this.aircraft = flightDetails.aircraft;
        this.status = flightDetails.status;
        this.airport = flightDetails.airport;

        this.callsign = this.identification && this.identification.callsign;
        this.airlineIcao = this.airline && this.airline.code.icao;
        this.aircraftIcao = this.aircraft && this.aircraft.model.code;
        this.genericTimestamp = flightDetails.status.generic.eventTime.utc;

        this.flightType = this.status.generic.status.type;

        this.origin = this.airport.origin.code && this.airport.origin.code.icao;
        this.destination =  this.airport.destination.code && this.airport.destination.code.icao;

        if (this.callsign) {
            const regex = '^[a-z][a-z][a-z]$';

            if (this.callsign.substring(0, 3).match(regex)) {
                this.airlineIcao = this.callsign.substring(0, 3);
            }
        }
    }

    getData(args) {
        const [aircraftType, origin, destination] = args;
        let completeString = this.airlineIcao;

        if (aircraftType) { completeString = `${completeString}/${this.aircraftIcao}`; }
        if (origin && this.origin) { completeString = `${completeString}/${this.origin}`; }
        if (destination && this.destination) { completeString = `${completeString}/${this.destination}`; }

        return completeString;
    }
}

function fetchData(airportCode, timestamp, pageNumber, callback) {
    const link = `https://api.flightradar24.com/common/v1/airport.json?code=${airportCode}&plugin[]=&plugin-setting[schedule][mode]=&plugin-setting[schedule][timestamp]=${timestamp}&page=${pageNumber}&limit=100&token=`;

    request(link, (error, response, body) => {
        if (error) {
            throw new Error(error);
        }

        if (response && response.statusCode === 400) {
            const parsedBody = JSON.parse(body);
            const flightRadarError = parsedBody.errors.message;

            throw new Error(flightRadarError);
        }

        callback(JSON.parse(body));
    });
}

function segregateFlightTypes(data) {
    const arrivals = data.result.response.airport.pluginData.schedule.arrivals.data;
    const departures = data.result.response.airport.pluginData.schedule.departures.data;

    return [departures, arrivals];
}

function constructFlightArray(args) {
    const [data, lowerTimestamp, upperTimestamp] = args;

    const flightDetailsArray = [];
    let dataComplete;
    let i = 0;

    while (i < data.length && !dataComplete) {
        const flightDetails = data[i].flight;
        const status = flightDetails.status.generic;
        const flightType = status.status.type;
        const genericTimeStamp = status.eventTime.utc;

        const scheduledTimestamp = flightDetails.time.scheduled[flightType];
        const actualTimestamp = flightDetails.time.real[flightType];
        const estimatedTimestamp = flightDetails.time.estimated[flightType];

        const timestamp = scheduledTimestamp || actualTimestamp || estimatedTimestamp || genericTimeStamp; // eslint-disable-line max-len

        if (lowerTimestamp <= timestamp && timestamp < upperTimestamp) {
            flightDetailsArray.push(new Flight(flightDetails));
            dataComplete = false;
        } else {
            dataComplete = true;
        }

        i++;
    }

    if (dataComplete == null) {
        dataComplete = true;
    }

    return [flightDetailsArray, dataComplete];
}

function extractRequiredInfo(args) {
    const [flightArray, getAircraft, getOrigin, getDestination] = args;
    const resultingArray = [];
    for (let i = 0; i < flightArray.length; i++) {
        const args = [getAircraft, getOrigin, getDestination];

        resultingArray.push(flightArray[i].getData(args));
    }

    return resultingArray;
}

function collectLikeTerms(array) {
    const i = 0;
    const endArray = [];
    let flightArray = array;

    while (flightArray.length !== 0) {
        const currentValue = flightArray[i];
        const arrayLength = flightArray.length;

        flightArray = _.without(flightArray, currentValue);

        const newArrayLength = flightArray.length;
        const frequency = arrayLength - newArrayLength;

        if (currentValue) {
            endArray.push([currentValue, frequency]);
        }
    }

    return endArray;
}

function exportAirlines(departureArray, arrivalArray, airportIcao) {
    const forceArrayOneLine = (key, value) => {
        if (typeof value === 'object') {
            if (value && typeof value[0] === 'string' && typeof value[1] === 'number') {
                return `[${value}]`;
            }
        }

        return value;
    };

    const exportObject = JSON.stringify({
        departures: departureArray.sort(),
        arrivals: arrivalArray.sort(),
    }, forceArrayOneLine, 4).toLowerCase();


    if (!fs.existsSync('./output')) {
        fs.mkdirSync('output');
    }

    const filePath = `./output/${airportIcao}.json`;

    fs.writeFile(filePath, exportObject, error => {
        if (error) {
            throw new TypeError(error);
        }

        console.log(`Saved as ${filePath}!`);
    });
}

const args = parseArguments(process.argv.slice(2));
const airportIcao = args._[0] || 0;
const includeAircraft = args.aircraft || false;
const includeOrigin = args.origin || false;
const includeDestination = args.destination || false;
console.log(`options: 
    airport: ${airportIcao}
    include aircraft type: ${includeAircraft}
    include origin: ${includeOrigin}
    include destination: ${includeDestination}
`);

if (airportIcao.length > 4 || airportIcao < 3) {
    throw new Error('Airport parameter must be 3 letter IATA or 4 letter ICAO');
}

const dateObj = new Date();
const startTimestamp = Math.round(dateObj.setUTCHours(0, 0, 0, 0) / 1000);
const endTimestamp = startTimestamp + 86400;

let departuresArray = [];
let arrivalsArray = [];
let pageNumber = 0;

const incrementPageNumber = function() {
    pageNumber++;
    console.log(`Retrieving page: ${pageNumber}`);

    const jsonRetrieved = parsedJson => {
        const [departures, arrivals] = segregateFlightTypes(parsedJson);

        let args = [departures, startTimestamp, endTimestamp];
        const [departuresDetailsArray, departuresComplete] = constructFlightArray(args);

        args = [arrivals, startTimestamp, endTimestamp];
        const [arrivalsDetailsArray, arrivalsComplete] = constructFlightArray(args);

        departuresArray = [...departuresArray, ...departuresDetailsArray];
        arrivalsArray = [...arrivalsArray, ...arrivalsDetailsArray];

        if (!arrivalsComplete || !departuresComplete) {
            incrementPageNumber();
        } else if (arrivalsComplete && departuresComplete) {
            args = [departuresArray, includeAircraft, includeOrigin, includeDestination];
            departuresArray = collectLikeTerms(extractRequiredInfo(args));

            args = [arrivalsArray, includeAircraft, includeOrigin, includeDestination];
            arrivalsArray = collectLikeTerms(extractRequiredInfo(args));

            exportAirlines(departuresArray, arrivalsArray, airportIcao);
        }
    };

    fetchData(airportIcao, startTimestamp, pageNumber, jsonRetrieved);
};

incrementPageNumber();
