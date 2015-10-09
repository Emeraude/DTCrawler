#!/usr/bin/env node

var Rp = require('requests-pool');
var cheerio = require('cheerio');
var _ = require('lodash');
var maria = require('mariasql');
var config = require('./config.json');
var rp = new Rp(100);

function getPage(options, cb) {
  rp.request(options, function(e, r) {
    if (e) {
      console.error(e)
      return;
    }
    var page = '';
    r.on('data', function(d) {
      page += d;
    }).on('end', function() {
      if (r.statusCode == 200)
	cb(page);
      else
	console.error('Error ' + r.statusCode);
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
    var quote = {id: nb,
		 content: [],
		 votes: {
		   plus: parseInt($('#' + nb + ' > a.voteplus').text().split(' ')[1]),
		   minus: parseInt($('#' + nb + ' > a.voteminus').text().split(' ')[1]),
		 },
		 comments: []
		};
    _.each($('#content > .item-entry > .item' + nb + ' > .item-content > a').html().split('<br>'), function(line) {
      quote.content.push({login: $('.decoration', '<p>' + line + '</p>').text(),
			  line: $('<p>' + line.split('</span>')[1] + '</p>').text()});
    });
    $('#comments > .comment').each(function(i, item) {
      var comment = {author: {}, votes: {}};
      comment.id = parseInt($(item).attr('id').substr(1));
      comment.content = $('<p>' + $('.comment-content > p', item).html().replace(/<br>/g, '\n') + '</p>').text();
      comment.votes.plus = parseInt($('a.voteplus', item).text().split(' ')[1]);
      comment.votes.minus = parseInt($('a.voteminus', item).text().split(' ')[1]);
      try {
	comment.author.login = $('.comment-content > a.gravatar > img', item).attr('alt');
	comment.author.id = parseInt($('.comment-content > a.gravatar', item).attr('href').split('.html')[0].split('/geek/')[1]);
      } catch(e) {
	comment.author = null;
      }
      quote.comments.push(comment);
    });
    cb(quote);
  });
}

var c = new maria();
c.connect(config.db);

function addAuthor(author) {
  c.query('SELECT COUNT(*) FROM `Authors` WHERE `id` = ' + author.id, function(e, r) {
    if (r[0]['COUNT(*)'] == '0') {
      c.query('INSERT INTO `Authors`(`id`, `login`) VALUES(' + author.id + ', "' + c.escape(author.login) + '")', function(e, r, i) {
      });
    }
  });
}

function addComment(comment, quoteId) {
  c.query('INSERT INTO `Comments`(`id`, `quoteId`, `authorId`, `content`, `voteplus`, `voteminus`) VALUES(' + comment.id + ', ' + quoteId + ', ' + (comment.author ? comment.author.id : 'NULL') + ', "' + c.escape(comment.content) + '", ' + comment.votes.plus + ', ' + comment.votes.minus + ')', function(e, r) {
    if (comment.author)
      addAuthor(comment.author);
    if (e)
      throw e;
  });
}

function updateComment(comment, quoteId) {
  c.query('SELECT COUNT(*) FROM `Comments` WHERE `id` = ' + comment.id, function(e, r) {
    if (r[0]['COUNT(*)'] != '0') {
      c.query('UPDATE `Comments` SET `voteminus` = ' + comment.votes.minus + ', `voteplus` = ' + comment.votes.plus + ' WHERE `id` = ' + comment.id, function(e, r, i) {
	if (e)
	  throw e;
      });
    }
    else
      addComment(comment, quoteId);
  });
}

function createQuote(quote) {
  c.query('INSERT INTO `Quotes`(`id`, `voteminus`, `voteplus`) VALUES(' + quote.id + ', ' + quote.votes.minus + ', ' + quote.votes.plus + ')', function(e, r) {
    if (e)
      throw e;
    _.each(quote.content, function(line) {
      c.query('INSERT INTO `Lines`(`quoteId`, `login`, `content`) VALUES(' + quote.id + ', "' + c.escape(line.login) + '", "' + c.escape(line.line) + '")', function(e, r, i) {
	if (e)
	  throw e;
      });
    });
    _.each(quote.comments, function(comment) {
      addComment(comment, quote.id);
    });
  });
}

getLatestQuoteNumber(function(nb) {
  for (i = 1; i <= nb; ++i) {
    getQuote(i, function(quote) {
      console.log('Parsed: ' + quote.id)
      c.query('SELECT COUNT(*) FROM `Quotes` WHERE `id` = ' + quote.id, function(e, r) {
	if (r[0]['COUNT(*)'] != '0') {
	  _.each(quote.comments, function(comment) {
	    updateComment(comment, quote.id);
	  });
	  c.query('UPDATE `Quotes` SET `voteminus` = ' + quote.votes.minus + ', `voteplus` = ' + quote.votes.plus + ' WHERE `id` = ' + quote.id, function(e, r) {
	    if (e)
	      throw e;
	  });
	}
	else
	  createQuote(quote);
      });
    });
  }
});
