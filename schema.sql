
DROP TABLE IF EXISTS location, weather, events, movies;

CREATE TABLE IF NOT EXISTS location (
  id SERIAL PRIMARY KEY,
  latitude DECIMAL,
  longitude DECIMAL,
  formatted_query TEXT,
  search_query TEXT
);


CREATE TABLE IF NOT EXISTS weather (
    id SERIAL PRIMARY KEY,
    time TEXT,
    forecast TEXT,
    search_query TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    link TEXT,
    name TEXT,
    event_date CHAR(15),
    summary TEXT,
    search_query TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS movies (
    id SERIAL PRIMARY KEY,
    title TEXT,
    overview TEXT,
    average_votes NUMERIC,
    total_votes NUMERIC,
    image_url TEXT,
    popularity NUMERIC,
    released_on CHAR(15),
    search_query TEXT
);

CREATE TABLE IF NOT EXISTS yelp (
    id SERIAL PRIMARY KEY,
    name TEXT,
    image_url TEXT,
    price TEXT,
    rating NUMERIC,
    url TEXT,
    search_query TEXT
);
