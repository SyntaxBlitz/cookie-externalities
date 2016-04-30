var GMClientApp = angular.module('GMClientApp', []);

GMClientApp.controller('GMClientCtrl', function ($scope) {
	window.MY_SCOPE = $scope;

	$scope.showFinalResults = false;

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
	});

	socket.on('Play game', function () {
		$scope.paused = false;
	});

	$scope.tryAuth = function (password) {
		$scope.waitingForAuth = true;
		socket.emit('Authorize GMClient', {'password': password});
	};

	$scope.setPhase = function (phase) {
		socket.emit('Set phase', {'phase': phase});
	};

	$scope.togglePause = function () {
		if ($scope.paused) {
			socket.emit('Play game');
		} else {
			socket.emit('Pause game');
		}
	};

	$scope.createMagicCookie = function (clicks) {
		socket.emit('Create magic cookie', {
			'clicks': clicks
		});
	};

});