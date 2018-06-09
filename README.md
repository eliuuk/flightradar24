# Data retriever for FlightRadar24
Intended for OpenScope use.

To use: 
1. clone the repository locally
2. `npm install`

# `npm run retrieve airport [--] [--aircraft] [--origin] [--destination]`
**Required**: `airport` (3 letter IATA or 4 letter ICAO airport code)

**Optional**:
- -- after `airport` parameter is required if the following parameters are used (ie. `npm run retrieve dxb -- --aircraft`) 
- --aircraft (aircraft type for each flight recorded is given) 
- --origin (origin airport for arrivals is given)
- --destination (destination airport for departures is given)

If the command `npm run retrieve airport` is run without parameters, a file with the frequency of all airlines flying in/out of the airport is given.

**Example command**: 
`npm run retrieve DXB --aircraft --destination` retrieves flights in/out of Dubai over from 0000z to 2359z, returning the frequency that an airline operates an aircraft type into Dubai, and the frequency an airline operates an aircraft type out to a destination

The output will require some formatting; it is recommended that an editor such as Atom, Visual Studio Code or Sublime Text is used to bulk process and format a file through the usage of the multi-cursor feature.
