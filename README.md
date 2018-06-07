# data retriever for FlightRadar24
Intended for openscope use.

To use: 
1. clone the repository locally
2. `npm install` 
3. locate the line `const airportCode = "DXB"` and replace DXB with a 3-letter IATA airport code or 4-letter ICAO code
4. `npm run retrieve`
5. your output will be the `output` folder, named airportCode.json

The output will require some formatting.
