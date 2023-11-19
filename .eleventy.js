const CleanCSS = require("clean-css");
const { minify } = require("terser");
module.exports = function (config) {
  config.addCollection("allPublications", (collectionApi) => {
    const dataName = "publications";
    return collectionApi.getAll()[0].data[dataName];
  });
  config.addCollection("publicationYears", (collectionApi) => {
    const allPublications = collectionApi.getAll()[0].data.publications;
    return [...new Set(allPublications.map(item => item.year))];
  });
  config.addCollection("publicationsByYear", (collectionApi) => {
    const allPublications = collectionApi.getAll()[0].data.publications;
    let byYear = {};
    const years = [...new Set(allPublications.map(item => item.year))];
    for (const year of years) {
      byYear[year] = allPublications.filter(item => item['year'] === year);
    }
    return byYear;
  });
  config.addCollection("publicationVenues", (collectionApi) => {
    const allPublications = collectionApi.getAll()[0].data.publications;
    return [...new Set(allPublications.map(item => item.journal.replace('&','and')))];
  });
  config.addCollection("publicationsByVenue", (collectionApi) => {
    const allPublications = collectionApi.getAll()[0].data.publications;
    let byVenue = {};
    const venues = [...new Set(allPublications.map(item => item.journal.replace('&','and')))];
    for (const venue of venues) {
      byVenue[venue] = allPublications.filter(item => item['journal'].replace('&','and') === venue);
    }
    return byVenue;
  });
  config.addCollection("publicationAuthors", (collectionApi) => {
    const allPublications = collectionApi.getAll()[0].data.publications;
    const authors = [...new Set([...new Set(allPublications.flatMap(item => item.author))].map(x => x.trim()))];
    return authors;
  });
  config.addCollection("publicationsByAuthor", (collectionApi) => {
    const allPublications = collectionApi.getAll()[0].data.publications;
    let byAuthor = {};
    const authors = [...new Set([...new Set(allPublications.flatMap(item => item.author))].map(x => x.trim()))];
    for (const author of authors) {
      byAuthor[author] = allPublications.filter(item => item['author'].includes(author));
    }
    return byAuthor;
  });
  config.addFilter('initials', function(name) {
    return name.split(' ')
               .map(word => word.charAt(0).toUpperCase())
               .join('');
});
  config.addFilter("unique", function (array, property) {
    return [...new Set(array.map(item => item[property]))];
  });
  config.addFilter('bibify', function (jsonObject) {
    let bibtex = `@${jsonObject.type}{${jsonObject.id},\n`;
    function formatBibtexField(key, value) {
      if (key === 'author' && Array.isArray(value)) {
        return `${key}={${value.join(' and ')}},\n`;
      } else if (key === "url") {
        return `${key}={${value.split(',')[0]}},\n`
      } else if (key === "date") {
        return `${key}={${value.split('T')[0]}},\n`
      }
      return `${key}={${value}},\n`;
    }
    for (const key in jsonObject) {
      if (jsonObject.hasOwnProperty(key) && key !== 'type' && key !== 'id') {
        bibtex += formatBibtexField(key, jsonObject[key]);
      }
    }
    bibtex += '}';
    return bibtex
  });
  config.addFilter("cssmin", function (code) {
    return new CleanCSS({}).minify(code).styles;
  });
  config.addPassthroughCopy("assets");
  config.addNunjucksAsyncFilter("jsmin", async function (
    code,
    callback
  ) {
    try {
      const minified = await minify(code);
      callback(null, minified.code);
    } catch (err) {
      console.error("Terser error: ", err);
      callback(null, code);
    }
  });
}