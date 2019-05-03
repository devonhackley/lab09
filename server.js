'use strict';

const express = require('express');
const superagent = require('superagent');
const cors = require('cors');
const pg = require('pg');
const app = express();

app.use(cors());
require('dotenv').config();
const PORT = process.env.PORT || 3000;

app.use(express.static('./'));

//Database setup
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();

// Routes
app.get('/', (request, response) => {
  response.status(200).send('Connected!');
});
app.get('/location', locationApp);
app.get('/weather', (req, res) => checkTable('weather', req, handleExistingTable, res));
app.get('/events', (req, res) => checkTable('events', req, handleExistingTable, res));
app.get('/movies', (req, res) => checkTable('movies', req, handleExistingTable, res));
app.get('/yelp', (req, res) => checkTable('yelp', req, handleExistingTable, res));



//uses google API to fetch coordinate data to send to front end using superagent
//has a catch method to handle bad user search inputs in case google maps cannot
//find location
function locationApp(request, response){
  let sqlStatement = 'SELECT * FROM location WHERE search_query=$1';
  let values = [request.query.data];
  return client.query(sqlStatement, values)
    .then(result => {
      if (result.rowCount > 0) {
        response.send(result.rows[0]);
      } else {
        const googleMapsUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${request.query.data}&key=${process.env.GEOCODE_API_KEY}`;
        return superagent.get(googleMapsUrl)
          .then(result => {
            const location = new Location(request, result);
            let insertStatement = 'INSERT INTO location ( search_query, formatted_query, latitude, longitude ) VALUES ( $1, $2, $3, $4 ) RETURNING id;';
            let insertValues = [ location.search_query, location.formatted_query, location.latitude, location.longitude ];
            client.query(insertStatement, insertValues)
              .then (pgResponse => {
                location.id = pgResponse.rows[0].id;
                response.send(location);
                return location;
              });
            // console.log('location', location);
            // response.send(location);
          })
          .catch(error => handleError(error, response));
      }
    })
}
// Obj that holds superagent callbacks
let refreshDataFunctions = {
  weather: weatherApp,
  events: eventsApp,
  movies: moviesApp,
  yelp: yelpApp
};

// Various timeouts
let timeouts = {
  weather: 15 * 1000,
  events: 15 * 1000,
  movies: 15 * 1000,
  yelp: 15 * 1000
};

// Helper Functions for table manipulation
function handleExistingTable(result){
  return result.rows;
}

function handleDeleteRecords(name, values, response, request) {
  let deleteStatement = `DELETE FROM ${name} WHERE location_id = $1`;
  client.query(deleteStatement, values)
    .then( () => {
      // get fresh data
      refreshDataFunctions[name](request, response);
    });
}
/************************************************************************/

function checkTable(tableName, request, function1, response){
  let sqlStatement = `SELECT * FROM ${tableName} WHERE location_id=$1`;
  let values = [request.query.data.id];
  return client.query(sqlStatement, values)
    .then(result => {
      if (result.rowCount > 0) {
        let created = result.rows[0].created_at;
        let currentTime = Date.now();
        if(currentTime - created > timeouts[tableName]) {
          handleDeleteRecords(tableName, values, response, request)
        } else {
          response.send(function1(result));
        }
      } else {
        refreshDataFunctions[tableName](request, response);
      }
    })
}
/****************************************************************************/

// Superagent callbacks
function weatherApp(req, res) {
  console.log('weather', req.query.data.id);
  const darkSkyUrl = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${req.query.data.latitude},${req.query.data.longitude}`;
  return superagent.get(darkSkyUrl)
    .then(result => {
      //make map one liner
      const weatherSummaries = result.body.daily.data.map(day => new Weather(day));
      weatherSummaries.forEach(item => {
        let insertStatement = 'INSERT INTO weather ( time, forecast, search_query, created_at, location_id ) VALUES ( $1, $2, $3, $4, $5);';
        let insertValues = [item.time, item.forecast, req.query.data.search_query, Date.now(), req.query.data.id];
        client.query(insertStatement, insertValues);
      })
      res.send(weatherSummaries);
    })
    .catch(error => handleError(error, res));
}

function eventsApp(req, res) {
  const eventBriteUrl = `https://www.eventbriteapi.com/v3/events/search/?location.within=10mi&location.latitude=${req.query.data.latitude}&location.longitude=${req.query.data.longitude}&token=${process.env.EVENTBRITE_API_KEY}`;
  return superagent.get(eventBriteUrl)
    .then(result => {
      const eventSummaries = result.body.events.slice(0, 20).map(event => new Event(event));
      eventSummaries.forEach(item => {
        let insertStatement = 'INSERT INTO events (link, name, event_date, summary, search_query, created_at, location_id ) VALUES ( $1, $2, $3, $4, $5, $6, $7 );';
        let insertValues = [ item.link, item.name, item.event_date, item.summary, req.query.data.search_query, Date.now(), req.query.data.id];
        return client.query(insertStatement, insertValues);
      })
      res.send(eventSummaries);
    })
    .catch(error => handleError(error, res));
}

function moviesApp(req, res) {
  const moviesUrl = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&query=${req.query.data.search_query}`;
  return superagent.get(moviesUrl)
    .then(result => {
      const movies = result.body.results.map(movie => new Movie(movie));
      movies.forEach(item => {
        let insertStatement = 'INSERT INTO movies (title, overview, average_votes, total_votes, image_url, popularity, released_on, created_at, location_id ) VALUES ( $1, $2, $3, $4, $5, $6, $7, $8, $9 );';
        let insertValues = [ item.title, item.overview, item.average_votes, item.total_votes, item.image_url, item.popularity, item.released_on, Date.now(), req.query.data.id];
        return client.query(insertStatement, insertValues);
      })
      res.send(movies);
    })
    .catch(error => handleError(error, res));
}

function yelpApp(req, res) {
  const yelpUrl = `https://api.yelp.com/v3/businesses/search?location=${req.query.data.search_query}`;
  return superagent.get(yelpUrl)
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(result => {
      const yelpObj = result.body.businesses.map(obj => new Yelp(obj));
      yelpObj.forEach(item => {
        let insertStatement = 'INSERT INTO yelp (name, image_url, price, rating, url, created_at, location_id ) VALUES ( $1, $2, $3, $4, $5, $6, $7);';
        let insertValues = [ item.name, item.image_url, item.price, item.rating, item.url, Date.now(), req.query.data.id];
        return client.query(insertStatement, insertValues);
      })
      res.send(yelpObj);
    })
    .catch(error => handleError(error, res));
}
/**********************************************************************************/

// Handles errors
function handleError(err, res) {
  if (res) res.status(500).send('Internal 500 error!');
}

// Constructor functions
function Weather(day) {
  this.time = new Date(day.time * 1000).toDateString();
  this.forecast = day.summary;
}

function Location(request, result) {
  this.search_query = request.query.data;
  this.formatted_query = result.body.results[0].formatted_address;
  this.latitude = result.body.results[0].geometry.location.lat;
  this.longitude = result.body.results[0].geometry.location.lng;
}

function Event(data) {
  this.link = data.url;
  this.name = data.name.text;
  this.event_date = new Date(data.start.local).toDateString();
  this.summary = data.description.text;
}

function Movie(data){
  this.title = data.original_title;
  this.overview = data.overview;
  this.average_votes = data.vote_average;
  this.total_votes = data.vote_count;
  this.image_url = `https://image.tmdb.org/t/p/w500/${data.poster_path}`;
  this.popularity = data.popularity;
  this.released_on = data.release_date;
}

function Yelp(data){
  this.name = data.name;
  this.image_url = data.image_url;
  this.price = data.price;
  this.rating = data.rating;
  this.url = data.url;
}
/*********************************************************************************/

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
