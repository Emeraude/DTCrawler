var http = require('http');
var cheerio = require('cheerio');

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
    var latestQuote;
    getPage({host: 'danstonchat.com', path: '/latest.html', port: 80, method: 'GET'}, function(page) {
	var $ = cheerio.load(page);
	$('#content > .item-listing > div.item').each(function(i, item) {
	    if (!i)
		latestQuote = parseInt($(item).attr('class').split(' ')[1].substr(4));
	});
	cb(latestQuote);
    });
}

getLatestQuoteNumber(function(nb) {
    console.log(nb);
});
