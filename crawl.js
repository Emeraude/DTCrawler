#!/usr/bin/env node

var Rp = require('requests-pool');
var cheerio = require('cheerio');
var _ = require('lodash');
var maria = require('mariasql');
var arg = require('commander')
var config = require('./config.json');
var rp = new Rp(100);

arg
  .version(require('./package.json').version)
  .usage('[-l|--lasts]')
  .option('-l, --lasts', 'Get the lasts quotes')
  .parse(process.argv);

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
  getPage({host: 'danstonchat.com', path: '/latest.html', port: 443, protocol: 'https', method: 'GET'}, function(page) {
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
  getPage({host: 'danstonchat.com', path: '/' + nb + '.html', port: 443, protocol: 'https', method: 'GET'}, function(page) {
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
  c.query('INSERT INTO `Authors`(`id`, `login`) VALUES(' + author.id + ', "' + c.escape(author.login) + '")', function(e, r) {});
}

function addComment(comment, quoteId) {
  c.query('INSERT INTO `Comments`(`id`, `quoteId`, `authorId`, `content`, `voteplus`, `voteminus`) VALUES(:id, :quoteId, :author, :content, :plus, :minus) ON DUPLICATE KEY UPDATE `voteminus` = VALUES(`voteminus`), `voteplus` = VALUES(`voteplus`)', {id: comment.id, quoteId: quoteId, author: comment.author ? comment.author.id : null, content: comment.content, plus: comment.votes.plus, minus: comment.votes.minus}, function(e, r) {
    if (comment.author)
      addAuthor(comment.author);
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

function crawlRange(start, end) {
  for (i = start; i <= end; ++i) {
    getQuote(i, function(quote) {
      console.log('Parsed: ' + quote.id)
      c.query('SELECT COUNT(*) FROM `Quotes` WHERE `id` = ' + quote.id, function(e, r) {
	if (r[0]['COUNT(*)'] != '0') {
	  _.each(quote.comments, function(comment) {
	    addComment(comment, quote.id);
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
}

getLatestQuoteNumber(function(nb) {
  if (arg.lasts) {
    c.query('SELECT MAX(`id`) FROM `Quotes`', function(e, r) {
      crawlRange(r[0]['MAX(`id`)'], nb);
    });
  }
  else
    crawlRange(1, nb);
});
