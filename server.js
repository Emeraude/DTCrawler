#!/usr/bin/env node

var express = require('express');
var maria = require('mariasql');
var _ = require('lodash');
var config = require('./config.json');
var app = express();

var c = new maria();
c.connect(config.db);

c.parsedQuery = function(query, cb) {
  c.query(query)
    .on('result', function(r) {
      var d = [];
      r.on('row', function(row) {
	d.push(row);
      }).on('end', function(i) {
	cb(undefined, d, i);
      }).on('error', function(e) {
	cb(e, undefined, undefined);
      });
    });
}

var quotesNb;

function updateQuotesNb() {
  c.parsedQuery('SELECT COUNT(*) FROM `Quotes`', function(e, r, i) {
    quotesNb = r[0]['COUNT(*)'];
  });
  setTimeout(updateQuotesNb, 6000);
}

updateQuotesNb();

function sendQuote(req, res, nb) {
  var query = 'SELECT `Quotes`.`id`, `Quotes`.`voteplus`, `Quotes`.`voteminus` FROM `Quotes`';
  if (nb)
    query += 'WHERE `Quotes`.`id` = ' + nb;
  else
    query += 'LIMIT 1 OFFSET ' + parseInt(Math.random() * quotesNb);
  c.parsedQuery(query, function(e, r, i) {
    if (!i.numRows) {
      res.statusCode = 404;
      res.statusMessage = 'Not found';
      res.send(res.statusMessage);
    }
    else {
      var data = {
	id: r[0].id,
	votes: {
	  plus: parseInt(r[0].voteplus),
	  minus: parseInt(r[0].voteminus)
	},
	content: [],
	comments: []};
      data.id = r[0].id;
      c.parsedQuery('SELECT `Lines`.`login`, `Lines`.`content` FROM `Lines` WHERE `Lines`.`quoteId` = ' + data.id, function(e, r, i) {
	_.each(r, function(row) {
	  data.content.push({login: row.login, line: row.content})
	});
	c.parsedQuery('SELECT `Comments`.`id`, `Comments`.`voteplus`, `Comments`.`voteminus`, `Comments`.`content`, `Comments`.`authorId`, `Authors`.`login` FROM `Comments` LEFT JOIN `Authors` ON `Comments`.`authorId` = `Authors`.`id` WHERE quoteId = ' + data.id, function(e, r, i) {
	  _.each(r, function(row) {
	    data.comments.push({
	      id: parseInt(row.id),
	      content: row.content,
	      author: {
		id: parseInt(row.authorId),
		name: row.login
	      },
	      votes: {
		plus: parseInt(row.voteplus),
		minus: parseInt(row.voteminus)
	      }
	    });
	  });
	  console.log('Quote ' + data.id + ' sent to ' + req.connection.remoteAddress);
	  res.statusCode = 200;
	  res.send(data);
	});
      });
    }
  })
}

app.get('/quote/:nb', function(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.params.nb.match(/^\d{1,}$/))
    sendQuote(req, res, req.params.nb);
  else if (req.params.nb == 'random')
    sendQuote(req, res);
  else {
    res.statusCode = 400;
    res.statusMessage = 'Invalid route';
    res.send(res.statusMessage);
  }
});

var server = app.listen(config.port, function() {
  console.log('Running on port ' + server.address().port);
})
