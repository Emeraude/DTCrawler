# DTCrawler

DTCrawler is a crawler that get all the quotes from [DTC](http://danstonchat.com).

## Usage

```bash
mysql -u root -p < db.sql
cp config.json.default config.json
./crawl.js
```

Note that it will crawl all the site. Soon you will be able to get only the latest quotes/comments.  
The crawler will take some time to get the data, but more to put it in the database. It's impossible to know when the datas are all in the database with the crawler, and there isn't any display of it. The script will not end. You have to check manually if the database growth stop.  
Once it's done, you can launch the API server.

```bash
./server.js
```

## Example

An example server is running at [broggit.me:3001](broggit.me:3001).  
You can use it to test the API

```bash
curl broggit.me:3001/quote/43 # will get the quote #43
```

## API

The API return JSON data.  
Note that the returned quotes are parsed line by line.

#### GET /quote/:nb

You will simply get all the datas about the quote, with this format:
```json
{
	"votes": {
		"plus": 1337,
		"minus": 42
	},
	"content": [
		{
			"login": "login1",
			"line": "line1",
		}, {
			"login": "login2",
			"line": "line2"
		}
	],
	"comments": [
		{
			"id": 42,
			"content": "This API is awesome",
			"author": {
				"id": 42,
				"login": "Emeraude"
			},
			"votes": {
				"plus": 1337,
				"minus": 42
			}
		}
	]
}
```

The *content.login* field contain all the informations before the message, it can contain the login, the date, a separator character etc...

#### GET /quote/random

**Not implemented yet.**

### Author

Emeraude
