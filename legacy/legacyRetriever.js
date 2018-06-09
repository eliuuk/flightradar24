const fs = require('fs');
const request = require('request');
const _ = require('lodash');

class Flight {
    constructor(flightDetails, airportCode) {
        this.identification = flightDetails.identification;
        this.airlineIcao = flightDetails.airline && flightDetails.airline.code.icao || '';

        this.callsign = flightDetails.identification.callsign || this.airlineIcao;

        this.aircraftIcao = flightDetails.aircraft.model.code;

        this.genericTimestamp = flightDetails.status.generic.eventTime.utc;

        this.scheduledDeparture = flightDetails.time.scheduled.departure
        || flightDetails.time.real.departure
        || flightDetails.time.estimated.departure
        || this.genericTimestamp;

        this.scheduledArrival = flightDetails.time.scheduled.arrival
        || flightDetails.time.real.arrival
        || flightDetails.time.estimated.arrival
        || this.genericTimestamp;



        this.flightType = flightDetails.status.generic.status.type;

        this.origin;
        this.destination;

        if (this.flightType === 'departure') {
            this.destination = flightDetails.airport.destination.code.icao || airportCode;
        } else {
            this.origin = flightDetails.airport.origin.code.icao || airportCode;
        }

        if (this.callsign) {
            this.airlineIcao = this.callsign.substring(0, 3);
        }
    }

    createArray() {
        return [`${this.airlineIcao}/${this.aircraftIcao}`.toLowerCase(), this.origin || this.destination];
    }

}

function fetchData(airportCode, timestamp, pageNumber, callback) {
    const link = `https://api.flightradar24.com/common/v1/airport.json?code=${airportCode}&plugin[]=&plugin-setting[schedule][mode]=&plugin-setting[schedule][timestamp]=${timestamp}&page=${pageNumber}&limit=100&token=`;

    request(link, (error, response, body) => {
        if (error) {
            throw new TypeError(error);
        }

        if (response && response.statusCode === 400) {
            throw new TypeError(JSON.parse(body).errors.message);
        }

        callback(JSON.parse(body));
    });
}

function segregateFlightTypes(data) {
    const arrivals = data.result.response.airport.pluginData.schedule.arrivals.data;
    const departures = data.result.response.airport.pluginData.schedule.departures.data;

    return [
        arrivals,
        departures,
    ];
}

function constructFlightDetailsArray(data, lowerTimestamp, upperTimestamp) {
    const flightDetailsArray = [];
    let dataComplete = false;
    let i = 0;

    while (i < data.length && !dataComplete) {
        const flightDetails = data[i].flight;
        const flightType = flightDetails.status.generic.status.type;
        const genericFlightTimestamp = flightDetails.status.generic['eventTime'.utc];
        const timestamp = flightDetails.time.scheduled[flightType]
            || flightDetails.time.real[flightType]
            || flightDetails.time.estimated[flightType]
            || genericFlightTimestamp;

        if (lowerTimestamp <= timestamp && timestamp < upperTimestamp) {
            flightDetailsArray.push(
                new Flight(flightDetails)
            );
        } else {
            dataComplete = true;
        }

        i++;
    }

    return [
        flightDetailsArray,
        dataComplete,
    ];
}

function exportAirlines(departuresArray, arrivalsArray, airportCode) {
    const forceArrayOneLine = function(key, value) {
        if (typeof value === 'object' && value.length === 3) {
            if (typeof value[0] === 'string' && typeof value[1] === 'string') {
                return JSON.stringify(value);
            }
        }

        return value;
    };

    const exportObject = {
        departures: departuresArray.sort(),
        arrivals: arrivalsArray.sort(),
    };

    const objectStringified = JSON.stringify(exportObject, forceArrayOneLine, 4);

    if (!fs.existsSync('output')) {
        fs.mkdirSync('output');
    }

    fs.writeFile(`output/${airportCode}.json`, objectStringified, error => {
        if (error) {
            throw new TypeError(error);
        }

        console.log(`Saved as ./output/${airportCode}.json`);
    });
}

function extractNeccessaryInfo(flightArray) {
    const resultingArray = [];

    for (let i = 0; i < flightArray.length; i++) {
        resultingArray.push(flightArray[i].createArray());
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

        endArray.push([currentValue, frequency]);
    }

    return endArray;
}

const airportCode = 'DXB';
const dateObj = new Date();
const startTimestamp = Math.round(dateObj.setUTCHours(0, 0, 0, 0) / 1000);
const endTimestamp = startTimestamp + 86400;

let departuresArray = [];
let arrivalsArray = [];
let pageNumber = 0;

const incrementPageNumber = function() {
    pageNumber++;
    console.log(`Retrieving page: ${pageNumber}`);

    const jsonRetrieved = function(parsedJson) {
        const segregatedTypes = segregateFlightTypes(parsedJson);
        const departures = segregatedTypes[0];
        const arrivals = segregatedTypes[1];

        let flightDetailsArray = constructFlightDetailsArray(
            departures,
            startTimestamp,
            endTimestamp,
            airportCode
        );

        const departuresComplete = flightDetailsArray[1];

        departuresArray = [...departuresArray, ...flightDetailsArray[0]];

        flightDetailsArray = constructFlightDetailsArray(
            arrivals,
            startTimestamp,
            endTimestamp,
            airportCode
        );

        const arrivalsComplete = flightDetailsArray[1];
        arrivalsArray = [...arrivalsArray, ...flightDetailsArray[0]];

        if (!arrivalsComplete && !departuresComplete) {
            incrementPageNumber();
        } else if (arrivalsComplete && departuresComplete) {
            departuresArray = collectLikeTerms(extractNeccessaryInfo(departuresArray));
            arrivalsArray = collectLikeTerms(extractNeccessaryInfo(arrivalsArray));

            exportAirlines(departuresArray, arrivalsArray, airportCode);
        }
    };

    fetchData(airportCode, startTimestamp.toString(), pageNumber.toString(), jsonRetrieved);
};

incrementPageNumber();
