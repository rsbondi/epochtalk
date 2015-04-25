var path = require('path');
var settings = require(path.normalize(__dirname + '/config'));

module.exports = [
  { method: 'GET', path: '/settings/{name}', config: settings.find },
  { method: 'POST', path: '/settings', config: settings.update }
];
