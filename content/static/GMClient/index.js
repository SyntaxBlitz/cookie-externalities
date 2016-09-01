var GMClientApp = angular.module('GMClientApp', []);

GMClientApp.controller('GMClientCtrl', function ($scope) {
	window.MY_SCOPE = $scope;

	$scope.showFinalResults = false;
	$scope.lastPhaseChange = 0;

	var socket = io('http://micro.hights.town');
	socket.on('initial', function (data) {
		$scope.phase = data.phase;
		$scope.paused = data.paused;

		if ($scope.phase === 5) {
			$scope.showFinalResults = true;
		}

		$scope.$apply();
	});

	socket.on('Authorized', function (data) {
		$scope.authorized = true;
		$scope.waitingForAuth = false;
		$scope.odorMultiplier = data.odorMultiplier;
		$scope.arominatorMultiplier = data.arominatorMultiplier;


		$scope.$apply();
	});

	socket.on('Authorization failed', function () {
		$scope.authorized = false;
		$scope.waitingForAuth = false;

		$scope.$apply();
	});	

	socket.on('New phase', function (data) {
		$scope.phase = data.phase;
		if ($scope.phase === 5) {
			$scope.showFinalResults = false;
			window.setTimeout(function () {
				$scope.showFinalResults = true;
			}, 5000);
		}

		$scope.$apply();
	});

	socket.on('Data update', function (data) {
		$scope.data = data;

		$scope.$apply();
	});

	socket.on('Player list update', function (list) {
		$scope.playerList = list.list;

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

	socket.on('Change odor multiplier', function (data) {
		$scope.odorMultiplier = data.multiplier;

		$scope.$apply();
	});

	socket.on('Change arominator multiplier', function (data) {
		$scope.arominatorMultiplier = data.multiplier;

		$scope.$apply();
	});

	$scope.tryAuth = function (password) {
		$scope.waitingForAuth = true;
		socket.emit('Authorize GMClient', {'password': password});
	};

	$scope.setPhase = function (phase) {
		if (+new Date() - $scope.lastPhaseChange < 2000) {
			return;	//important that you don't accidentally double-click
		}
		$scope.lastPhaseChange = +new Date();
		socket.emit('Set phase', {'phase': phase});
	};

	$scope.togglePause = function () {
		if ($scope.paused) {
			socket.emit('Play game');
		} else {
			socket.emit('Pause game');
		}
	};

	$scope.createMagicCookie = function () {
		var clicks = prompt('How many clicks? (cookies / 10)', $scope.playerList.length * 5);
		var con = confirm('Add magic cookie with ' + clicks + ' clicks?');
		if (con) {
			socket.emit('Create magic cookie', {
				'clicks': clicks
			});
		}
	};

	$scope.promptOdorMultiplier = function () {
		var potentialMultiplier = prompt('New odor multiplier?', $scope.odorMultiplier);
		potentialMultiplier = parseFloat(potentialMultiplier);
		var shouldChange = confirm('Change odor multiplier from ' + $scope.odorMultiplier + ' to ' + potentialMultiplier + '?');
		if (shouldChange) {
			socket.emit('Change odor multiplier', {'multiplier': potentialMultiplier});
		}
	};

	$scope.promptArominatorMultiplier = function () {
		var potentialMultiplier = prompt('New arominator multiplier? (factories/arominator)', $scope.arominatorMultiplier);
		potentialMultiplier = parseFloat(potentialMultiplier);
		var shouldChange = confirm('Change arominator multiplier from ' + $scope.arominatorMultiplier + ' to ' + potentialMultiplier + '?');
		if (shouldChange) {
			socket.emit('Change arominator multiplier', {'multiplier': potentialMultiplier});
		}
	};

});