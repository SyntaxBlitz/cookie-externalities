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

var GameClientApp = angular.module('GameClientApp', []);
var gUuid = globalUuid();
var NETWORK_TICKRATE = 500;
var PRODUCER_TICKRATE = 250;

var PHASES = {
	'lobby': 0,
	'tap_for_cookies': 1,
	'purchase_producers': 2,
	'odor_introduction': 3,
	'government_intervention': 4
};

GameClientApp.controller('GameClientCtrl', function ($scope) {
	window.MY_SCOPE = $scope;

	var socket = io('http://micro.hights.town');
	socket.on('initial', function (data) {
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
		'cookiePresses': 15,
		'factories': 25
	};

	var networkInterval;
	var producerInterval;

	var startTicking = function () {
		console.log('START TICKING');
		networkInterval = window.setInterval(function () {
			if ($scope.phase !== 0) {
				socket.emit('Data update', {'uuid': gUuid, 'data': $scope.data});	// not really meant to be secure :)
			}
		}, NETWORK_TICKRATE);

		producerInterval = window.setInterval(function () {
			if ($scope.paused)
				return;

			for (var i = 0; i < $scope.data.arominators; i++) {
				if (Math.random() < $scope.expectedValues().arominators / (1000 / PRODUCER_TICKRATE)) {
					$scope.data.cookies++;
					//addCookieAnimation('arominators');
				}
			}

			for (var i = 0; i < $scope.data.cookiePresses; i++) {
				if (Math.random() < $scope.expectedValues().cookiePresses / (1000 / PRODUCER_TICKRATE)) {
					$scope.data.cookies++;
					//addCookieAnimation('cookiePresses');
				}
			}

			for (var i = 0; i < $scope.data.factories; i++) {
				if (Math.random() < $scope.expectedValues().factories / (1000 / PRODUCER_TICKRATE)) {
					$scope.data.cookies++;
					//addCookieAnimation('factories');
				}
			}

			$scope.$apply();
		}, PRODUCER_TICKRATE);
	};

	// cache these values for use when the store is up
	var cookieTops = {'arominators': 0, 'cookiePresses': 0, 'factories': 0};
	var cookieLeft;

	addCookieAnimation = function (type) {
		var cookieHeight = 16;

		if (!$scope.showStore) {
			var rowElement = document.getElementById(type + 'Row');
			var top = rowElement.offsetTop;
			var height = rowElement.offsetHeight;

			var cookieMargin = 15;
			cookieTops[type] = top + height / 2 - cookieHeight / 2;

			// use offsetHeight because it gives the square width/height of the image, except in extreme cases
			cookieLeft = rowElement.offsetLeft + rowElement.offsetHeight + cookieMargin;
		}

		var img = document.createElement('img');
		img.src = '/static/cookie-256.png';
		img.width = img.height = cookieHeight;

		img.style.top = cookieTops[type] + 'px';
		img.style.left = cookieLeft + 'px';

		document.getElementById('floatingCookies').appendChild(img);
		img.className = 'cookieAnimate';
		window.setTimeout(function () {
			img.style.transform = 'translateX(70vw)';
			img.style.opacity = '0';			
		}, 10);	// this delay fixes a weird thing where the animation just doesn't happen in chrome..

		window.setTimeout(function () {
			img.parentNode.removeChild(img);
		}, 3100);
	};

	var stopTicking = function () {
		window.clearInterval(networkInterval);
		window.clearInterval(producerInterval);
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

	window.setInterval(function () {
		if ($scope.magicCookieClicks === 0 && !scope.showStore && $scope.phase > 0) {
			location.reload();
		}
	}, 30 * 1000);

});