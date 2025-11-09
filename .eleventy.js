const CleanCSS = require("clean-css");
const { minify } = require("terser");
const { readFileSync } = require("fs");
module.exports = function (config) {
  // Helper to safely derive a venue name for a publication
  const getVenue = (item) => {
    const v = item && (item.journal || item.booktitle || item.venue || item.publisher);
    if (!v) return null;
    // Ensure string and normalize '&' to 'and' to keep URL slugs stable
    return String(v).replace('&', 'and');
  };
  config.addFilter('filterByKeyValue', function(arr, key, value) {
    return arr.filter(function(item) {
        return item[key] === value;
    });
});
  config.addCollection("allPublications", (collectionApi) => {
    const dataName = "publications";
    return collectionApi.getAll()[0].data[dataName].sort((a, b) => b.year - a.year);
  });
  config.addCollection("publicationYears", (collectionApi) => {
    const allPublications = (collectionApi.getAll()[0] || {}).data?.publications.sort((a, b) => b.year - a.year) || [];
    return [...new Set(allPublications.map(item => item?.year).filter(y => y !== undefined && y !== null))];
  });
  config.addCollection("publicationsByYear", (collectionApi) => {
    const allPublications = (collectionApi.getAll()[0] || {}).data?.publications.sort((a, b) => b.year - a.year) || [];
    let byYear = {};
    const years = [...new Set(allPublications.map(item => item?.year).filter(y => y !== undefined && y !== null))];
    for (const year of years) {
      byYear[year] = allPublications.filter(item => item && item.year === year);
    }
    return byYear;
  });
  config.addCollection("publicationVenues", (collectionApi) => {
    const allPublications = (collectionApi.getAll()[0] || {}).data?.publications.sort((a, b) => b.year - a.year) || [];
    return [...new Set(allPublications.map(getVenue).filter(Boolean))];
  });
  config.addCollection("publicationsByVenue", (collectionApi) => {
    const allPublications = (collectionApi.getAll()[0] || {}).data?.publications.sort((a, b) => b.year - a.year) || [];
    let byVenue = {};
    const venues = [...new Set(allPublications.map(getVenue).filter(Boolean))];
    for (const venue of venues) {
      byVenue[venue] = allPublications.filter(item => getVenue(item) === venue);
    }
    return byVenue;
  });
  config.addCollection("publicationAuthors", (collectionApi) => {
    const allPublications = (collectionApi.getAll()[0] || {}).data?.publications.sort((a, b) => b.year - a.year) || [];
    const raw = allPublications.flatMap(item => Array.isArray(item?.author) ? item.author : (item?.author ? [item.author] : []));
    const authors = [...new Set(raw.map(x => (typeof x === 'string' ? x.trim() : String(x).trim())).filter(Boolean))];
    return authors;
  });
  config.addCollection("publicationsByAuthor", (collectionApi) => {
    const allPublications = (collectionApi.getAll()[0] || {}).data?.publications.sort((a, b) => b.year - a.year) || [];
    const raw = allPublications.flatMap(item => Array.isArray(item?.author) ? item.author : (item?.author ? [item.author] : []));
    const authors = [...new Set(raw.map(x => (typeof x === 'string' ? x.trim() : String(x).trim())).filter(Boolean))];
    let byAuthor = {};
    for (const author of authors) {
      byAuthor[author] = allPublications.filter(item => {
        const arr = Array.isArray(item?.author) ? item.author : (item?.author ? [item.author] : []);
        return arr.some(a => (typeof a === 'string' ? a.trim() : String(a).trim()) === author);
      });
    }
    return byAuthor;
  });
  config.addFilter('initials', function (name) {
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
      if (jsonObject.hasOwnProperty(key) && key !== 'type' && key !== 'id' && !key.startsWith("_")) {
        bibtex += formatBibtexField(key, jsonObject[key]);
      }
    }
    bibtex += '}';
    return bibtex
  });
  config.addFilter("cssmin", function (code) {
    return new CleanCSS({}).minify(code).styles;
  });
  let getSvgContent = function (file) {
    let relativeFilePath = `./assets/${file}.svg`;
    let data = readFileSync(relativeFilePath,
      function (err, contents) {
        if (err) return err
        return contents
      });

    return data.toString('utf8');
  }
  config.addShortcode("svg", getSvgContent);
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
  // Return Eleventy configuration to support pathPrefix for GitHub Pages
  return {
    pathPrefix: process.env.PATH_PREFIX || "/"
  };
}