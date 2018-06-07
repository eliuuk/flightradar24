const fs = require('fs')
const request = require('request');

function filterFleets(airlineFleets, state) {
    for (i = 0; i < airlineFleets.length; i++) {
        let index = airlineFleets.indexOf(airlineFleets[i]),
            counter = 0

        while (index != -1) {
            counter++;
            index = airlineFleets.indexOf(airlineFleets[i], index + 1)
        }

        finalArray[state].push([airlineFleets[i], counter])

        airlineFleets = airlineFleets.filter(function(value) {
            if (value == airlineFleets[i]) {
                return false
            }
            return true
        })

        finalArray[state].sort()

        i--
    }
}

class Flight {
    constructor(flightDetails, airportCode) {
        this.identification = flightDetails['identification']
        this.airlineIcao = flightDetails['airline']['code']['icao'] || ""

        this.callsign = flightDetails['identification']['callsign'] || this.airlineIcao;

        this.aircraftIcao = flightDetails['aircraft']['model']['code'];

        this.genericTimestamp = flightDetails['status']['generic']['eventTime']['utc'];

        this.scheduledDeparture = flightDetails['time']['scheduled']['departure']
        || flightDetails['time']['real']['departure']
        || flightDetails['time']['estimated']['departure']
        || genericTimestamp;

        this.scheduledArrival = flightDetails['time']['scheduled']['arrival']
        || flightDetails['time']['real']['arrival']
        || flightDetails['time']['estimated']['arrival']
        || genericTimestamp;



        this.flightType = flightDetails['status']['generic']['status']['type'];

        this.origin
        this.destination

        if (this.flightNumber === 'departure') {
            this.destination = flightDetails['airport']['destination']['code']['icao'] || airportCode
        } else {
            this.origin = flightDetails['airport']['origin']['code']['icao'] || airportCode
        }

        if (this.callsign) {
            this.airlineIcao = this.callsign.substring(0, 3);
        }
    }

    createArray(airlineWithFleet) {
        const output = [`${this.airlineIcao}/${this.aircraftIcao}`.toLowerCase(), this.origin || this.destination]
            || `${this.airlineIcao}/${this.aircraftIcao}`.toLowerCase()
            || `${this.airlineIcao}`;

        return [`${this.airlineIcao}/${this.aircraftIcao}`.toLowerCase(), this.origin || this.destination];
    }

}

function fetchData(airportCode, timestamp, pageNumber, callback) {
    const link = `https://api.flightradar24.com/common/v1/airport.json?code=${airportCode}&plugin[]=&plugin-setting[schedule][mode]=&plugin-setting[schedule][timestamp]=${timestamp}&page=${pageNumber}&limit=100&token=`

    request(link, (error, response, body) => {
        if (error) {
            throw new TypeError(error);
        }

        if (response && response.statusCode === 400) {
            throw new TypeError(JSON.parse(body)['errors']['message'])
        }

        callback(JSON.parse(body))
    })
}

function segregateFlightTypes(data) {
    const arrivals = data['result']['response']['airport']['pluginData']['schedule']['arrivals']['data']
    const departures = data['result']['response']['airport']['pluginData']['schedule']['departures']['data']

    return [
        arrivals,
        departures
    ]
}

function constructFlightDetailsArray(data, lowerTimestamp, upperTimestamp, airportCode) {
    const flightDetailsArray = [];
    let dataComplete = false,
        i = 0;

    while (i < data.length && !dataComplete) {
        let flightDetails = data[i]['flight'],
            flightType = flightDetails['status']['generic']['status']['type'],
            genericFlightTimestamp = flightDetails['status']['generic']['eventTime'['utc']],
            timestamp = flightDetails['time']['scheduled'][flightType]
                || flightDetails['time']['real'][flightType]
                || flightDetails['time']['estimated'][flightType]
                || genericFlightTimestamp;            

        if (lowerTimestamp <= timestamp && timestamp < upperTimestamp) {
            flightDetailsArray.push(
                new Flight(flightDetails, airportCode)
            )
        } else {
            dataComplete = true
        }

        i++;
    }

    return [
        flightDetailsArray,
        dataComplete
    ]
}

function exportAirlines(departuresArray, arrivalsArray, airportCode) {
    const forceArrayOneLine = function(key, value) {
        if (typeof value === 'object' && value.length === 3) {
            if (typeof value[0] === 'string' && typeof value[1] === 'string') {
                return JSON.stringify(value)
            }
        }

        return value
    }

    const exportObject = {
        "departures": departuresArray.sort(),
        "arrivals": arrivalsArray.sort()
    }

    objectStringified = JSON.stringify(exportObject, forceArrayOneLine, 4)

    if (!fs.existsSync('output')) {
        fs.mkdirSync('output')
    }

    fs.writeFile(`output/${airportCode}.json`, objectStringified, (error) => {
        if (error) {
            throw new TypeError(error)
        }

        console.log(`Saved as ./output/${airportCode}.json`)
    })
}

function extractNeccessaryInfo(flightArray) {
    let resultingArray = []

    for (i = 0; i < flightArray.length; i++) {
        resultingArray.push(flightArray[i].createArray())
    }
    return resultingArray
}

function collectLikeArrays(flightArray) {
    const i = 0
    let endArray = []

    while (flightArray.length != 0) {
        let counter = 0
        let currentArray = flightArray[i]
        let index = flightArray.indexOf(flightArray[i])

        flightArray = flightArray.filter((value) => {
            let compare = currentArray.toString()
            value = value.toString()
            
            if (value != compare) {
                return true
            } else {
                counter++;
                return false
            }
        })

        endArray.push([...currentArray, counter])
    }
    return endArray
}

const airportCode = "DXB",
    dateObj = new Date(),
    startTimestamp = Math.round(dateObj.setUTCHours(0, 0, 0, 0) / 1000),
    endTimestamp = startTimestamp + 86400;

let departuresArray = [],
    arrivalsArray = [],
    pageNumber = 0;

incrementPageNumber = function () {
    pageNumber++;
    console.log(`Retrieving page: ${pageNumber}`)

    const jsonRetrieved = function(parsedJson) {
        let segregatedTypes = segregateFlightTypes(parsedJson)
        let departures = segregatedTypes[0],
            arrivals = segregatedTypes[1];

        let flightDetailsArray = constructFlightDetailsArray(departures, startTimestamp, endTimestamp, airportCode),
            departuresComplete = flightDetailsArray[1];

        departuresArray = [...departuresArray, ...flightDetailsArray[0]]

        flightDetailsArray = constructFlightDetailsArray(departures, startTimestamp, endTimestamp, airportCode),
            arrivalsComplete = flightDetailsArray[1],
            arrivalsArray = [...arrivalsArray, ...flightDetailsArray[0]];

        if (!arrivalsComplete && !departuresComplete) {
            incrementPageNumber();
        } else if (arrivalsComplete && departuresComplete) {
            departuresArray = collectLikeArrays(extractNeccessaryInfo(departuresArray));
            arrivalsArray = collectLikeArrays(extractNeccessaryInfo(arrivalsArray));

            exportAirlines(departuresArray, arrivalsArray, airportCode);
        }
    }

    fetchData(airportCode, startTimestamp.toString(), pageNumber.toString(), jsonRetrieved);
}

incrementPageNumber()
