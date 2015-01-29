/**
 * For jQuery plugin concepts, see http://learn.jquery.com/plugins/basic-plugin-creation/
 * and http://learn.jquery.com/plugins/advanced-plugin-concepts/
 *
 * Usage:
 *
 * $( '.cabinet' ).deckard( { } );
 */
;( function ( $, window, document, undefined ) {

	// Private function for debugging.
	var debug = function( obj ) {
		if ( window.console && window.console.log ) {
			window.console.log( obj );
		}
	};

	var sPluginName = 'deckard';

	var oDefaults = {
		'onAfterBroadcast': function () {},
		'onAfterLoad': function () {},
		'onBeforeBack': function() {},
		'onBeforeBroadcast': function() {},
		'onBeforeLoad': function() {},
		'onLoadJson': function( oData ) {
			debug( 'onLoadJson' );
			debug( oData );
			notify( 'Error', oData.message, 'growl-error' );
		},
		'onMask': function() {},
		'onUnmask': function() {},
		'onTransformUrlComponent': function( sUrlComponent ) {
			// this line alone will break this plugin for anyone else
			return site_url( sUrlComponent );
		}
	};

	/**
	 * This is a private function, and cannot be called globally
	 * because it is defined within a function call.
	 *
	 * @constructor
	 * @param element
	 * @param options
	 * @param uniqueid
	 */
	function Deckard( element, options, uniqueid ) {
		// This is a plain html DOM node, the container of the cards
		this.element = element;
		this.$oPack = $( element );

		// Specific options for this instance
		this.options = $.extend( {}, oDefaults, options );

		this._defaults = oDefaults;
		this._name = sPluginName;

		this.sDefaultKard = '';
		this.sId = uniqueid;
		this.aKardStack = [];
		this.oLoadData = {};
		this.oLoadMethod = 'GET';

		/**
		 * This parses the all the "data-kard-actions" and creates jQuery ".on()" events, such as "click"
		 * @private
		 * @param element
		 * @returns {Deckard}
		 */
		this.applyKardActions = function ( element ) {
			var $oElement = $( element );
			var aAction = $oElement.attr( 'data-kard-action' ).split( ':' );

			var scope = this;
			var sCommand = aAction[0];
			var sParameter = aAction[1];

			// todo: allow uri(...), and parse this out

			if ( sCommand == 'load' ) {
				if ( sParameter.substring( 0, 5 ) == 'this.' ) {
					$.proxy( this[sParameter.substr( 5 )], scope ).apply( scope, $oElement );
				}
				else {
					$.proxy( window[sParameter], scope ).apply( scope, $oElement );
				}
			}
			else {
				if ( sParameter == 'back' ) {
					$oElement.on( sCommand,
						function () {
							scope.back();
							return false;
						}
					);
				}
				else if ( sParameter == 'reset' ) {
					$oElement.on( sCommand,
						function () {
							scope.reset();
							return false;
						}
					);
				}
				else {
					if ( sParameter.substring( 0, 5 ) == 'this.' ) {
						$oElement.on( sCommand, $.proxy( this[sParameter.substr( 5 )], scope ) );
					}
					else {
						$oElement.on( sCommand, $.proxy( window[sParameter], scope ) );
					}
				}
			}
			return this;
		};

		/**
		 * If a previous card exists, then the "back" action will reactive the
		 * previous card and update the title
		 * @returns {Deckard}
		 */
		this.back = function () {
			this.options.onBeforeBack.call( this );

			// Try to find the first existing previous kard
			while ( this.aKardStack.length > 0 ) {
				var sName = this.aKardStack.pop();
				var $oMatchingKards = this.$oPack.find( 'div.kard[data-kard-name="'+sName+'"]' );
				if ( $oMatchingKards.length > 0 ) {
					this.show( $oMatchingKards.first() );
					return this;
				}
			}

			// If we couldn't find a kard to go back to, then we just load the default kard
			if ( !this.aKardStack.length && this.sDefaultKard ) {
				this.load( this.sDefaultKard, true );
			}

			return this;
		};

		/**
		 * @param sEventName
		 * @returns {Deckard}
		 */
		this.broadcast = function ( sEventName ) {
			this.options.onBeforeBroadcast.call( this );

			$( 'div.deckard[data-deckard-listener^="'+sEventName+':"]' ).each(
				function ( oElement, nIndex ) {
					var $oElement = $( this );
					var oDeckard = $oElement.data( 'plugin-' + sPluginName );
					var aAction = $oElement.attr( 'data-deckard-listener' ).split( ':' );
					if ( aAction[1] ) {
						oDeckard[aAction[1]]();
					}
				}
			);

			this.options.onAfterBroadcast.call( this );
			return this;
		};

		/**
		 * @returns {object}
		 */
		this.getActiveKard = function() {
			return this.activeCard;
		};

		/**
		 * @returns {string}
		 */
		this.getDefaultKard = function () {
			return this.sDefaultKard;
		};

		/**
		 * @returns {string}
		 */
		this.getId = function() {
			return this.sId;
		};

		/**
		 * @param sUrlComponent
		 * @returns {boolean}
		 */
		this.has = function ( sUrlComponent ) {
			return ( this.$oPack.find( 'div[data-kard-uri="'+sUrlComponent+'"]' ).length > 0 );
		};

		/**
		 * @param sUrlComponent
		 * @param bReload
		 * @returns {Deckard}
		 */
		this.load = function ( sUrlComponent, bReload ) {
			this.options.onBeforeLoad.call( this );

			// Ensure we have a valid url component
			if ( sUrlComponent == '' ) {
				return this;
			}

			// todo: if the pack is empty and there is a default specified, use that

			// Take a snapshot of information that we will need for the asynchronous functions
			var oInstance = this;
			var cOnLoadJson = this.options.onLoadJson;
			var cOnAfterLoad = this.options.onAfterLoad;

			if ( !bReload ) {
				// Look for an already loaded card with the same URI
				// here we could store cards internally
				var $oMatchingKard = this.$oPack.find( 'div[data-kard-uri="'+sUrlComponent+'"]' );

				// if the URI is matched on a pre-existing/loaded kard, then we simply display that card
				// and then return immediately
				if ( $oMatchingKard.length ) {
					this.stackKard( this.activeCard );
					return this.show( $oMatchingKard );
				}
			}

			this.activeCard = this.$oPack.find( '.kard:not(.hidden)' );
			this.masked = this.activeCard.length? this.activeCard: this.$oPack;

			this.options.onMask.call( this, this.masked );
			var sUrl = this.options.onTransformUrlComponent.call( this, sUrlComponent );
			sUrl = sUrl + (sUrl.indexOf( '?' ) === -1? '?': '&') + sPluginName + '=' + this.getId();

			var oRequest = {
				'context': this,
				'url': sUrl,
				'type': this.oLoadMethod,
				'dataType': 'html',
				'success': function ( oData, sTextStatus, oXmlHttpRequest ) {
					var bIsJson = false;
					try {
						var oTestResponse = jQuery.parseJSON( oData );
						if ( typeof oTestResponse == 'object' ) {
							bIsJson = true;
						}
					}
					catch ( oException ) {

					}

					if ( bIsJson ) {
						cOnLoadJson.call( this, jQuery.parseJSON( oData ) );
					}
					else {
						var sCardContent = Utilities.extractScriptTags( oData );

						var sScript = Utilities.extractScript( oData );
						if ( sScript ) {
							sScript = "var oDeckard = $( 'div.deckard[data-deckard-uniqid=" + this.$oPack.attr('data-deckard-uniqid') + "]' ).data( 'plugin-deckard' );"
							+ "\n" + sScript;
						}

						var $oNewKard = $( sCardContent );

						// Find the actual "div.kard"'s within the new content
						var $oKards = $oNewKard.hasClass( 'kard' )? $oNewKard: $( 'div.kard', $oNewKard );

						// Set the kard-uri for those that don't have one
						if ( !$oKards.attr( 'data-kard-uri' ) ) {
							$oKards.attr( 'data-kard-uri', sUrlComponent );
						}

						// Remove any kards with an identical name
						var sNewKardName = $oKards.data( 'kard-name' );
						if ( sNewKardName ) {
							// we should probably replace the position in the stack?
							this.$oPack.find('div[data-kard-name="' + sNewKardName + '"]').remove();
						}

						// Keep a hold of the current active card
						var $oActiveCard = this.activeCard;

						// Append the new content to the pack
						$oNewKard.appendTo( this.$oPack );

						Utilities.applyScript( sScript );
						//Utilities.loadScriptTags( oData );

						// TODO: Here we need to analyse the data returned and save reference to the new card
						$oNewKard.find( 'a[data-kard-action],button[data-kard-action],input[data-kard-action]' ).each(
							function ( arg1, arg2 ) {
								oInstance.applyKardActions( this );
							}
						);

						$oKards = $oKards.filter( '.kard' );
						if ( $oKards.attr( 'data-kard-action' ) ) {
							this.applyKardActions( $oKards.get( 0 ) );
						}

						// Only update the previous card if the active card is not a once card
						if ( $oActiveCard.length == 1 && $oActiveCard.not( '[data-kard-once]' ).length == 1 ) {
							this.$oPack.data( 'previous-card', $oActiveCard );
							this.stackKard( $oActiveCard );
						}
						this.show( $oNewKard );
					}

					cOnAfterLoad.call( this );
				},
				'complete': function () {
					this.options.onUnmask.call( this, this.masked );
					this.oLoadMethod = 'GET';
					this.oLoadData = false;
				}
			};

			// Apply any data if set (remember it is always unset after each load)
			if ( this.oLoadData !== false ) {
				oRequest.data = this.oLoadData;
			}

			$.ajax( oRequest );

			return this;
		};

		/**
		 * @param sUrlComponent
		 * @returns {boolean}
		 */
		this.reload = function( sUrlComponent ) {
			this.load( sUrlComponent, true );
			return this;
		};

		/**
		 * @returns {Deckard}
		 */
		this.removeAll = function() {
			this.$oPack.find( '.kard' ).remove();
			return this;
		};

		/**
		 * @returns {Deckard}
		 */
		this.reset = function() {
			this.removeAll();
			this.init();
			return this;
		};

		this.resetEvents = function() {
			this.options = $.extend( {}, oDefaults, options );
			return this;
		};

		/**
		 * @param sUrlComponent
		 * @returns {Deckard}
		 */
		this.setDefaultKard = function( sUrlComponent ) {
			this.sDefaultKard = sUrlComponent;
			return this;
		};

		/**
		 * @param sEvent
		 * @param cCallable
		 * @returns {function}
		 */
		this.setEventHandler = function( sEvent, cCallable ) {
			var cPrevious = this.options[sEvent];
			this.options[sEvent] = cCallable;
			return cPrevious;
		};

		/**
		 * @param sId
		 * @returns {Deckard}
		 */
		this.setId = function( sId ) {
			this.sId = sId;
			return this;
		};

		/**
		 * @returns {Deckard}
		 */
		this.setLoadData = function( oLoadData ) {
			this.oLoadData = oLoadData;
			return this;
		};

		/**
		 * @returns {Deckard}
		 */
		this.setLoadDataFromElement = function( $oElement ) {
			this.oLoadData = $( '<form />' ).append( $oElement.clone() ).serializeArray();
			return this;
		};

		/**
		 * @returns {Deckard}
		 */
		this.setLoadMethod = function( sMethod ) {
			this.oLoadMethod = sMethod;
			return this;
		};

		/**
		 * @param $oContent
		 * @returns {Deckard}
		 */
		this.show = function( $oContent ) {
			var $oKards = $oContent.filter( '.kard' );
			if ( $oKards.attr( 'data-kard-title' ) ) {
				this.updateTitle( $oKards.attr( 'data-kard-title' ) );
				// todo: save the starting title and revert to this
			}

			this.$oPack.find( 'div.kard' ).addClass( 'hidden' );
			$oContent.removeClass( 'hidden' );

			$oOnce = this.$oPack.find( 'div.kard.hidden[data-kard-once="true"]' );
			$oOnce.remove();

			this.activeCard = $oContent;
			return this;
		};

		/**
		 * @param $oKard
		 * @returns {Deckard}
		 */
		this.stackKard = function( $oKard ) {
			var sName = $oKard.attr( 'data-kard-name' );
			this.aKardStack.push( sName );
			return this;
		};

		/**
		 * @param sNewTitle
		 * @returns {Deckard}
		 */
		this.updateTitle = function ( sNewTitle ) {
			// use an attribute to set a selector to find title element
			// todo: these selectors are very specific to our theme
			this.$oPack.parent( '.block' ).find( '>.navbar h5' ).html( sNewTitle );
			return this;
		};

		this.init();
	}

	Deckard.prototype = {
		init: function () {
			var $oThis = $( this.element );

			if ( $oThis.data( 'deckard-default-kard' ) ) {
				this.setDefaultKard( $oThis.data( 'deckard-default-kard' ) );
				this.load( this.getDefaultKard() );
			}
		}
	};

	/**
	 * Generic plugin attachment code for jQuery.
	 *
	 * @param sAction
	 * @returns {*}
	 */
	$.fn[sPluginName] = function ( sAction ) {
		var aArguments = arguments;

		var getId = (
			function () {
				var incrementingId = 1;
				//return function(element) {
				return function( prefix ) {
					/*
					if (!element.id) {
						element.id = "id_" + incrementingId++;
						// Possibly add a check if this ID really is unique
					}
					return element.id;
					*/
					return ''+prefix+(incrementingId++);
				};
			}()
		);

		return this.each(
			function () {
				// Restrict only one instance per element
				if ( !$.data( this, 'plugin-' + sPluginName ) ) {
					var nInstanceId = getId( 'd' );
					var oInstance = new Deckard( this, sAction, nInstanceId );

					// Attach the instance as "data" to the element
					$.data( this, 'plugin-' + sPluginName, oInstance );

					// Create a unique deckard ID. This is so we can get holdof the element any time
					$( this ).attr( 'data-deckard-uniqid', nInstanceId );
				}
				else {
					var oInstance = $.data( this, 'plugin-' + sPluginName );
					// This again is special handler code for setting options
					if ( sAction == 'option' ) {
						oInstance.options[aArguments[1]] = aArguments[2];
					}
					else if ( typeof sAction === "string" && oInstance[sAction] !== undefined ) {
						oInstance[sAction].apply( oInstance, aArguments.slice( 1 ) );
					}
				}
			}
		);
	}

})( jQuery, window, document );