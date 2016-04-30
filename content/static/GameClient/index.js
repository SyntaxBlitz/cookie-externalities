var globalUuid = function () {
	if (localStorage && localStorage.getItem('uuid')) {
		return localStorage.getItem('uuid');
	} else {
		var gUuid = uuid.v4();
		if (localStorage) {
			localStorage.setItem('uuid', gUuid);
		}
		return gUuid;
	}
};

var preload1 = new Image();
preload1.src = '/static/cookie-256.png';
var preload2 = new Image();
preload2.src = '/static/magic-cookie-256.png';

var context;

var GameClientApp = angular.module('GameClientApp', []);
var gUuid = globalUuid();
var NETWORK_TICKRATE = 1000;
var PRODUCER_TICKRATE = 100;

var PHASES = {
	'lobby': 0,
	'tap_for_cookies': 1,
	'purchase_producers': 2,
	'odor_introduction': 3,
	'government_intervention': 4
};

var canvasDimensions = [0, 0];

var ticking = false;
var giveCookies;
var networkTick;

GameClientApp.controller('GameClientCtrl', function ($scope) {
	window.MY_SCOPE = $scope;

	var socket = io('http://micro.hights.town');
	socket.on('initial', function (data) {
		setCanvasDimensions();

		$scope.phase = data.phase;
		$scope.processingNick = false;
		$scope.inGame = false;
		$scope.paused = data.paused;
		stopTicking();

		socket.emit('Bind UUID', {'uuid': gUuid});

		$scope.$apply();
	});

	socket.on('Current state', function (data) {
		$scope.nick = data.nick;
		$scope.data = data.data;
		$scope.inGame = true;
		startTicking();

		$scope.$apply();
	});

	socket.on('Nickname failure', function () {
		$scope.processingNick = false;

		$scope.$apply();
	});

	socket.on('Nickname success', function (data) {
		$scope.nick = data.nick;
		$scope.processingNick = false;

		$scope.$apply();
	});

	socket.on('Kicked (game started without nick)', function (data) {
		$scope.inGame = false;

		$scope.$apply();
	});

	socket.on('New phase', function (data) {
		$scope.phase = data.phase;

		$scope.$apply();
	});

	socket.on('Pause game', function () {
		$scope.paused = true;

		$scope.$apply();
	});

	socket.on('Play game', function () {
		$scope.paused = false;

		$scope.$apply();
	});

	socket.on('Ranking update', function (data) {
		$scope.rank = data.rank;

		$scope.$apply();
	});

	socket.on('Magic cookie clicks left', function (data) {
		$scope.magicCookieClicks = data.remaining;
	});

	$scope.setNick = function (name) {
		socket.emit('Request nickname', {'uuid': gUuid, 'nick': name});
		$scope.processingNick = true;
	};

	$scope.clickCookie = function (name) {
		if ($scope.magicCookieClicks > 0) {
			$scope.data.cookies += 10;
			socket.emit('Magic cookie click');
		} else {
			$scope.data.cookies++;
		}
	};

	$scope.buy = function (item) {
		var price = $scope.price(item, 'buy');
		if($scope.data.cookies >= price) {
			$scope.data.cookies -= price;
			$scope.data[item]++;
		}
	};

	$scope.sell = function (item) {
		$scope.data.cookies += $scope.price(item, 'sell');
		$scope.data[item]--;
	};

	$scope.expectedValues = function () {
		if ($scope.phase < PHASES.government_intervention) {
			return {
				'arominators': 1,
				'cookiePresses': 2,
				'factories': 5
			};
		} else {
			return {
				'arominators': 2,
				'cookiePresses': 2,
				'factories': 2
			};
		}
	};

	$scope.priceMatrix = {
		'arominators': 10,
		'cookiePresses': 12,
		'factories': 18
	};

	var networkInterval;

	var startTicking = function () {
		ticking = true;
	};

	giveCookies = function (delta) {
		if ($scope.paused)
			return;

		for (var i = 0; i < $scope.data.arominators; i++) {
			var cookiesToGive = $scope.expectedValues().arominators / (1000 / delta);
			while (cookiesToGive > 1) {
				$scope.data.cookies++;
				addCookie('arominators');
				cookiesToGive--;
			}
			if (Math.random() < cookiesToGive) {
				$scope.data.cookies++;
				addCookie('arominators');
			}
		}

		for (var i = 0; i < $scope.data.cookiePresses; i++) {
			var cookiesToGive = $scope.expectedValues().cookiePresses / (1000 / delta);
			while (cookiesToGive > 1) {
				$scope.data.cookies++;
				addCookie('cookiePresses');
				cookiesToGive--;
			}
			if (Math.random() < cookiesToGive) {
				$scope.data.cookies++;
				addCookie('cookiePresses');
			}
		}

		for (var i = 0; i < $scope.data.factories; i++) {
			var cookiesToGive = $scope.expectedValues().factories / (1000 / delta);
			while (cookiesToGive > 1) {
				$scope.data.cookies++;
				addCookie('factories');
				cookiesToGive--;
			}
			if (Math.random() < cookiesToGive) {
				$scope.data.cookies++;
				addCookie('factories');
			}
		}

		$scope.$apply();
	};

	networkTick = function () {
		if ($scope.phase !== 0) {
			socket.emit('Data update', {'uuid': gUuid, 'data': $scope.data});	// not really meant to be secure :)
		}
	};

	// cache these values for use when the store is up
	var cookieTops = {'arominators': 0, 'cookiePresses': 0, 'factories': 0};
	var cookieLeft;

	var stopTicking = function () {
		ticking = false;
	};

	$scope.earningPotential = function () {
		var ep = 5;	// assume five cookie clicks per second

		for (var producer in $scope.expectedValues()) {
			ep += $scope.expectedValues()[producer] * $scope.data[producer];
		}

		return ep;
	};

	$scope.price = function (type, action) {
		if (!$scope.data) {
			return;
		}

		var multiplier = 1;
		if (action === 'sell') {
			multiplier = .5
		}
		return Math.floor($scope.priceMatrix[type] * $scope.earningPotential() * multiplier);
	};

});

var toAdd = {'arominators': false, 'cookiePresses': false, 'factories': false};

window.onload = function () {
	context = document.getElementById('cookiesCanvas').getContext('2d');

	var cookieImg = new Image();
	cookieImg.src = '/static/cookie-256.png';

	var lastFrame = +new Date();
	var gradient = context.createLinearGradient(0, 0, context.canvas.width, context.canvas.height);
	gradient.addColorStop(0, 'rgba(243, 237, 250, 0)');
	gradient.addColorStop(.2, 'rgba(243, 237, 250, 0)');
	gradient.addColorStop(.8, 'rgba(243, 237, 250, .1)');
	gradient.addColorStop(1, 'rgba(243, 237, 250, 1)');
	var lastNetworkUpdate = +new Date();
	var render = function () {
		var currentFrame = +new Date();
		var delta = currentFrame - lastFrame;
		lastFrame = currentFrame;

		context.fillStyle = gradient;
		context.fillRect(0, 0, context.canvas.width, context.canvas.height);

		var movePx = 3 * (delta / 16);

		var imageData = context.getImageData(0, 0, context.canvas.width - movePx, context.canvas.height);
		context.putImageData(imageData, movePx, 0);
		context.fillStyle = 'rgb(243,237,250)';
		context.fillRect(0, 0, movePx, context.canvas.height);

		drawCookies(cookieImg);

		if (ticking) {
			// Give cookies from producers
			giveCookies(delta);

			// Update the server every NETWORK_TICKRATE milliseconds
			if (currentFrame - lastNetworkUpdate > NETWORK_TICKRATE) {
				networkTick();

				lastNetworkUpdate = currentFrame;
			}
		}

		window.requestAnimationFrame(render);
	};

	window.requestAnimationFrame(render);

};

var drawCookies = function (cookieImg) {
	if (toAdd.arominators) {
		context.drawImage(cookieImg, 0, window.innerHeight * .08 / 2, 16, 16);
		toAdd.arominators = false;
	}
	if (toAdd.cookiePresses) {
		context.drawImage(cookieImg, 0, window.innerHeight * .12 + window.innerHeight * .08 / 2, 16, 16);
		toAdd.cookiePresses = false;
	}
	if (toAdd.factories) {
		context.drawImage(cookieImg, 0, window.innerHeight * .24 + window.innerHeight * .08 / 2, 16, 16);
		toAdd.factories = false;
	}
};

var addCookie = function (which) {
	toAdd[which] = true;
};

window.onresize = function () {
	setCanvasDimensions();
};

var setCanvasDimensions = function () {
	var cookieMargin = 15;

	var rowWidth = window.innerWidth - 10 * 2;
	var rowHeight = window.innerHeight * .08;

	canvasDimensions = [
		rowWidth - rowHeight - cookieMargin,
		rowHeight * 3 + rowHeight * .5 * 2
	];

	var canvas = document.getElementById('cookiesCanvas');
	canvas.width = canvasDimensions[0];
	canvas.height = canvasDimensions[1];

	// save me jesus
	canvas.style.top = (window.innerHeight * .1 + window.innerWidth * .6 + window.innerHeight * .05 + window.innerHeight * .07 + window.innerHeight * .04) + 'px';
	canvas.style.right = '10px';
};