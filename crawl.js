#!/usr/bin/env node

var http = require('http');
var cheerio = require('cheerio');
var _ = require('lodash');

function getPage(options, cb) {
    var page = '';
    http.get(options, function(r) {
	r.on('data', function(d) {
	    page += d;
	}).on('end', function() {
	    cb(page);
	});
    });
}

function getLatestQuoteNumber(cb) {
    getPage({host: 'danstonchat.com', path: '/latest.html', port: 80, method: 'GET'}, function(page) {
	var $ = cheerio.load(page);
	var latestQuote;
	$('#content > .item-listing > div.item').each(function(i, item) {
	    if (!i)
		latestQuote = parseInt($(item).attr('class').split(' ')[1].substr(4));
	});
	cb(latestQuote);
    });
}

function getQuote(nb, cb) {
    getPage({host: 'danstonchat.com', path: '/' + nb + '.html', port: 80, method: 'GET'}, function(page) {
	var $ = cheerio.load(page);
	var quote = {content: []};
	_.each($('#content > .item-entry > .item' + nb + ' > .item-content > a').html().split('<br>'), function(line) {
	    quote.content.push({login: $('.decoration', line).text(),
				line: $('<p>' + line.split('</span>')[1] + '</p>').text()});
	});
	console.log(quote);
    });
}

getLatestQuoteNumber(function(nb) {
    getQuote(nb);
});
