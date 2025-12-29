const express = require('express');
const path = require('path');

// Import the built Express app
const app = require('../dist/index.js').default || require('../dist/index.js');

module.exports = app;
