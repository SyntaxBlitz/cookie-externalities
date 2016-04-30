var fs = require('fs');
var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

var sendFileOptions = {
	root: '/home/nginx/www/micro.hights.town/content'
};

var phase = 0;
var gmClientSocket = null;
var players = {};
var NETWORK_TICKRATE = 100;
var UPDATE_TICKRATE = 100;
var paused = false;

var magicCookieClicks = 0;
var sentMagicCookieZero = true;

var odor = 0;
var odorMultiplier = .2; // each arominator decreases the odor level by odorMultiplier * amount by which factories increase level.
                         // this lets us rig the simulation so it does what we want. set this to a lower number to make arominators less useful for society.
                         // set it to a high number to lower the odor level quicker.

var PHASES = {
	'lobby': 0,
	'tap_for_cookies': 1,
	'purchase_producers': 2,
	'odor_introduction': 3,
	'government_intervention': 4,
	'game_over': 5
};

app.use('/static', express.static(sendFileOptions.root + '/static'));

app.get('/', function (req, res) {
	res.sendFile('GameClient.html', sendFileOptions);
});

app.get('/gm', function (req, res) {
	res.sendFile('GMClient.html', sendFileOptions);
});

io.on('connection', function (socket) {
	socket.emit('initial', {'phase': phase, 'paused': paused});

	socket.on('Authorize GMClient', function (data) {
		if (data.password === 'externality1') {	// I thought really hard about this one
			setupGMSocket(socket);
		} else {
			socket.emit('Authorization failed');
		}
	});

	socket.on('Bind UUID', function (data) {
		if (players[data.uuid] !== undefined) {
			players[data.uuid].socket = socket;
			syncPlayer(socket, data.uuid);
		} else {
			if (phase === PHASES.lobby) {
				setupNewPlayer(data.uuid);
				syncPlayer(socket, data.uuid);
			} else {
				socket.emit('Too late, game started');
			}
		}
	});
});

var checkNick = function (nick) {
	if (nick.length < 3 || nick.length > 24) {
		return false;
	}

	for (var uuid in players) {
		if (players[uuid].nick === nick) {
			return false;
		}
	}

	return true;
};

var setupGMSocket = function (socket) {
	gmClientSocket = socket;

	socket.emit('Authorized');

	if (Object.keys(players).length > 0) {
		socket.emit('Player list update', {'list': playerNames()});
	}

	socket.on('Set phase', function (data) {
		if (phase === PHASES.lobby && data.phase >= PHASES.tap_for_cookies) {
			startGame();
			startTicking();
		}
		if (data.phase === PHASES.odor_introduction) {
			odor = .4;
		}
		phase = data.phase;
		io.emit('New phase', {'phase': phase});
	});

	socket.on('Pause game', function () {
		paused = true;
		io.emit('Pause game');
	});

	socket.on('Play game', function () {
		paused = false;
		io.emit('Play game');
	});

	socket.on('Create magic cookie', function (data) {
		magicCookieClicks = data.clicks;
		sentMagicCookieZero = false;
	});
};

var startGame = function () {
	for (var uuid in players) {
		if (players[uuid].nick === '') {
			players[uuid].socket.emit('Kicked (game started without nick)');
			delete players[uuid];
		}
	}
};

var setupNewPlayer = function (uuid) {
	players[uuid] = {
		'nick': '',
		'socket': null,
		'data': {
			'cookies': 0,
			'cookiePresses': 0,
			'factories': 0,
			'arominators': 0
		}
	};
};

var syncPlayer = function (socket, uuid) {
	players[uuid].socket = socket;

	socket.emit('Current state', {
		'nick': players[uuid].nick,
		'data': players[uuid].data
	});

	socket.on('Request nickname', function (data) {
		if (checkNick(data.nick) && players[data.uuid] !== undefined) {
			players[data.uuid].nick = data.nick;
			socket.emit('Nickname success', {'nick': data.nick});
			if (gmClientSocket) {
				gmClientSocket.emit('Player list update', {'list': playerNames()});
			}
		} else {
			socket.emit('Nickname failure');
		}
	});

	socket.on('Data update', function (data) {
		if (players[data.uuid])
			players[data.uuid].data = data.data;
	});

	socket.on('Magic cookie click', function () {
		magicCookieClicks--;
		if (magicCookieClicks < 0) {
			magicCookieClicks = 0;
		}
	});
};

var playerNames = function () {
	return Object.keys(players).map(function (uuid) {
		return players[uuid].nick;
	}).filter(function (nick) {
		if (nick !== '') {
			return true;
		} else {
			return false;
		}
	});
};

var startTicking = function () {
	setInterval(function () {
		gmClientSocket.emit('Data update', getGMData());
		sendPlayerRankings();
		if (magicCookieClicks > 0 || !sentMagicCookieZero) {
			io.emit('Magic cookie clicks left', {
				'remaining': magicCookieClicks
			});
			if (magicCookieClicks === 0) {
				sentMagicCookieZero = true;
			}
		}
	}, NETWORK_TICKRATE);

	setInterval(function () {
		if (paused || phase === PHASES.game_over)
			return;

		if (phase >= PHASES.odor_introduction) {
			// If each person owns five factories and zero arominators (which is probably a low estimate of factories/arominators or factories-arominators),
			// it should take ten minutes to bring odor from 0% to 100%.
			var odorPerFactoryPerSecond = 1 / (Object.keys(players).length * 5 * 60 * 10);

			var counts = getCounts();
			var factories = counts.factories;
			var arominators = counts.arominators;

			odor += odorPerFactoryPerSecond * factories * (UPDATE_TICKRATE / 1000);
			odor -= odorPerFactoryPerSecond * arominators * (UPDATE_TICKRATE / 1000) * odorMultiplier;

			odor = Math.max(0, Math.min(1, odor));

			if (phase === PHASES.government_intervention && odor === 0) {
				phase = PHASES.game_over;
				io.emit('New phase', {'phase': phase});
			}
		}
	}, UPDATE_TICKRATE);
};

var getCounts = function () {
	var counts = {
		'cookies': 0,
		'cookiePresses': 0,
		'factories': 0,
		'arominators': 0
	};

	for (var uuid in players) {
		for (var index in counts) {
			counts[index] += players[uuid].data[index];
		}
	}

	return counts;
};

var getPlayerRankings = function () {
	var rankings = Object.keys(players);
	rankings.sort(function (a, b) {
		return players[b].data.cookies - players[a].data.cookies;
	});

	return rankings;
};

var getGMData = function () {
	var counts = getCounts();

	var playerArray = getPlayerRankings();

	var rankings = playerArray.slice(0, 5).map(function (uuid) {
		return {
			'nick': players[uuid].nick,
			'cookies': players[uuid].data.cookies
		};
	});

	var sendOdor = odor;
	if (phase < PHASES.odor_introduction || phase > PHASES.government_intervention) {
		sendOdor = 0;
	}

	return {
		'counts': counts,
		'rankings': rankings,
		'odor': sendOdor
	};
};

var sendPlayerRankings = function () {
	var rankings = getPlayerRankings();

	for (var i = 0; i < rankings.length; i++) {
		var uuid = rankings[i];
		players[uuid].socket.emit('Ranking update', {
			'rank': (i + 1)
		});
	}
};

server.listen(8642);