var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var morgan = require('morgan');
var pg = require('pg');
var jwt = require('jsonwebtoken');
var config = require('./config');
//var User   = require('./app/models/user'); 
var crypto = require('crypto'),
    algorithm = 'aes-256-ctr',
    password = 'stealth';
var uuid = require('node-uuid');
 
function encrypt(text){
  
  var cipher = crypto.createCipher(algorithm,password)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}
 
function decrypt(text){
  var decipher = crypto.createDecipher(algorithm,password)
  var dec = decipher.update(text,'hex','utf8')
  dec += decipher.final('utf8');
  return dec;
}

var connectionString = 'postgres://maverick:topgun@localhost:5432/poc';
var port = process.env.PORT || 8080;
var cli = new pg.Client(connectionString);
cli.connect(function (err) {
    if (err) {
        return console.error('could not connect to postgres', err);
    }
    else {
        return console.log('OK');
    }
});
app.set('secret', config.secret); // secret for tokens.
var apiRoutes = express.Router();


app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.use(morgan('dev'));

//Endpoint 0 : Test
//TODO: Arnav-add healthcheck kinda stuff here.
app.get('/', function (req, res) {
    res.send('API in place at http://localhost:' + port + '/api');
});

// Endpoint 1: create a new user
app.post('/setup', function (req, res) {

    var data = {
        id: req.body.id,
        rname: req.body.rname,
        username: req.body.username,
        password: req.body.password,
        email_id: req.body.email_id,
        jti: uuid.v1(),
	role: req.body.role
    };
    console.log(req.body);
    pg.connect(connectionString, function (err, client, done) {

        // SQL Query > Insert Data
	console.log(data);
	var pass = encrypt(data.password);
	console.log(pass);
        var query = client.query("INSERT INTO users(name, username, password, email, jti, role) values($1, $2, $3, $4, $5, $6)", [data.rname, data.username, pass, data.email_id, data.jti, data.role], function (err, result) {
console.log (err);
if (err){
res.status(500).send({
success: false,
message: 'something bad happened'});
}
else{
res.status(200).send({
success: true,
message: 'user created'});
}
});

        


    });
});

//Endpoint 2:  authenticate a user and generate a JWT
apiRoutes.post('/authenticate', function (req, res) {
    var data = {username: req.body.username, password: req.body.password};
    pg.connect(connectionString, function (err, client, done) {
        if (err) throw err;
        var user = client.query("SELECT * FROM users where username =($1)", [req.body.username], function (err, result) {
            console.log(result.rows[0].password)
            if (!result) {
                res.status(404).send({
                    success: false,
                    message: 'User Not Found'
                });
            } else if (decrypt(result.rows[0].password) != req.body.password) {
                    res.status(403).send({
                        success: false,
                        message: 'Incorrect Password.'
                    });
            } else {
                    var token_query = client.query("SELECT jti,role FROM users where username = ($1)", [req.body.username], function (err, result) {
                        var token_id = result.rows[0].jti;
			var role = result.rows[0].role;
			if(role == 'admin')
			{ var claim = 'W'}
			else{ var claim = 'R'}

			
                        var token_data = {username: req.body.username, password: req.body.password, token_id: token_id, claim: claim, iss: "Stealth"}
                        var token = jwt.sign(token_data, app.get('secret'), { expiresInMinutes: 60, iat: Date.now()});
                        res.json({
                            success: true,
                            message: 'JWT!',
                            token: token
                        });
                    });
            }

        });
    });
});

apiRoutes.use(function (req, res, next) {
    var token = req.body.token || req.query.token || req.headers['x-access-token'];

    // decode token    
	if (token) {
	

        jwt.verify(token, app.get('secret'), function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {

                req.decoded = decoded;
                next();
            }
        });

    } else {

        return res.status(403).send({
            success: false,
            message: 'No token provided.'
        });

    }
});

//Endpoint 3 : get  all users. this is JWT potected.
apiRoutes.get('/users', function (req, res) {

    var results = [];

    // Get a Postgres client from the connection pool
    pg.connect(connectionString, function (err, client, done) {

        // SQL Query > Select Data
        var query = client.query("SELECT * FROM users ORDER BY id ASC;");

        // Stream results back one row at a time
        query.on('row', function (row) {
            results.push(row);
        });

        // After all data is returned, close connection and return results
        query.on('end', function () {
            client.end();
            return res.json(results);
        });

        // Handle Errors
        if (err) {
            console.log(err);
        }

    });

});
//Endpoint 4 : get user based on the id. this is JWT potected.
apiRoutes.get('/users/:id', function (req, res) {

    var results = [];
    var id = req.params.id;

    // Get a Postgres client from the connection pool
    pg.connect(connectionString, function (err, client, done) {

        // SQL Query > Select Data
        var query = client.query("SELECT * FROM users where id = $1", [id]);

        // Stream results back one row at a time
        query.on('row', function (row) {
            results.push(row);
        });

        // After all data is returned, close connection and return results
        query.on('end', function () {
            client.end();
            return res.json(results);
        });

        // Handle Errors
        if (err) {
            console.log(err);
        }

    });

});


app.use('/api', apiRoutes);
app.listen(port);
console.log('Listening at http://localhost:' + port);
