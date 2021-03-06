var config,
	authStrategy,
	socket,
	metrics,
	SocketEnvelope;

var _ = require( 'lodash' );
var debug = require( 'debug' )( 'autohost:websocket-adapter' );
var wrapper = {
	action: wireupAction,
	resource: wireupResource,
	start: start,
	stop: stop
};

function buildActionAlias( resourceName, action ) {
	return [ resourceName, action.alias ].join( '.' );
}

function buildActionTopic( resourceName, action ) {
	return [ resourceName, action.topic ].join( '.' );
}

function checkPermissionFor( user, action ) {
	debug( 'Checking %s\'s permissions for %s', ( user ? user.name : 'nouser' ), action );
	return authStrategy.checkPermission( user.name, action )
		.then( null, function(err) {
			debug( 'Error during check permissions: %s', err.stack );
			return false;
		} )
		.then( function( granted ) {
			return granted;
		} );
}

function start() {
	socket.start( authStrategy );
}

function stop() {
	socket.stop();
}

function wireupResource( resource ) {
	var meta = { topics: {} };
	_.each( resource.actions, function( action ) {
		wireupAction( resource, action, meta );
	} );
	return meta;
}

function wireupAction( resource, action, meta ) {
	var topic = buildActionTopic( resource.name, action ),
		alias = buildActionAlias( resource.name, action );

	meta.topics[ action.alias ] = { topic: topic };
	debug( 'Mapping resource \'%s\' action \'%s\' to topic %s', resource.name, action.alias, alias );
	socket.on( topic, function( message, socket ) {
		var data = message.data || message;
		var respond = function() {
			var envelope = new SocketEnvelope( topic, message, socket );
			action.handle.apply( resource, [ envelope ] );
		};
		if( authStrategy ) {
			checkPermissionFor( socket.user, alias )
				.then( function( pass ) {
					if( pass ) {
						debug( 'WS activation of action %s for %s granted', alias, socket.user.name );
						respond();
					} else {
						debug( 'User %s was denied WS activation of action %s', socket.user.name, alias );
						socket.publish( data.replyTo || topic, 'User lacks sufficient permission' );
					}
				} );
		} else {
			respond();
		}
	} );
}

module.exports = function( cfg, auth, sock, meter ) {
	config = cfg;
	authStrategy = auth;
	socket = sock;
	metrics = meter;
	SocketEnvelope = require( './socketEnvelope.js' );
	return wrapper;
};