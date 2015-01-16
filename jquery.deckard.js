/**
 * For jQuery plugin concepts, see http://learn.jquery.com/plugins/basic-plugin-creation/
 * and http://learn.jquery.com/plugins/advanced-plugin-concepts/
 *
 * Usage:
 *
 * $( '.cabinet' ).deckard( { } );
 */
;( function ( $, window, document, undefined ) {

	var sPluginName = 'deckard';

	var oDefaults = {
		'onBeforeBack': function() {},
		'onBeforeLoad': function() {},
		'onAfterLoad': function () {},
		'onMask': function() {},
		'onUnmask': function() {},
		'onTransformUrlComponent': function( sUrlComponent ) {
			return site_url( sUrlComponent );
		}
	};

	// Private function for debugging.
	var debug = function( obj ) {
		if ( window.console && window.console.log ) {
			window.console.log( obj );
		}
	};

	/**
	 * This is a private function, and cannot be called globally
	 * because it is defined within a function call.
	 *
	 * @constructor
	 * @param element
	 * @param options
	 */
	function Deckard( element, options ) {
		// This is a plain html DOM node, the container of the cards
		this.element = element;
		this.$oPack = $( element );

		// Specific options for this instance
		this.options = $.extend( {}, oDefaults, options ) ;

		this._defaults = oDefaults;
		this._name = sPluginName;

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
					$.proxy( this[sParameter.substr( 5 )], scope ).call();
				}
				else {
					$.proxy( window[sParameter], scope ).call();
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

			while ( this.aKardStack.length > 0 ) {
				var sName = this.aKardStack.pop();
				var $oMatchingKards = this.$oPack.find( 'div.kard[data-kard-name="'+sName+'"]' );
				if ( $oMatchingKards.length > 0 ) {
					this.show( $oMatchingKards.first() );
					break;
				}
			}
			return this;
		};

		/**
		 * Using only a url component
		 * @param sUrlComponent
		 * @param sName
		 * @returns {Deckard}
		 */
		this.load = function ( sUrlComponent, sName ) {
			var oInstance = this;

			this.options.onBeforeLoad.call( this );
			// if the pack is empty and there is a default specified, use that

			// Look for an already loaded card with the same URI
			// here we could store cards internally
			var $oMatchingKard = this.$oPack.find( 'div[data-kard-uri="'+sUrlComponent+'"]' );

			// If we fail to find a card via the URI, we try then via the name
			if ( !$oMatchingKard.length && sName ) {
				$oMatchingKard = this.$oPack.find( 'div[data-kard-name="'+sName+'"]' );
			}

			// if the URI is matched on a pre-existing/loaded kard, then we simply display that card
			// and then return immediately
			if ( $oMatchingKard.length ) {
				this.stackKard( this.activeCard );
				return this.show( $oMatchingKard );
			}

			this.activeCard = this.$oPack.find( '.kard:not(.hidden)' );
			this.masked = this.activeCard.length? this.activeCard: this.$oPack;

			this.options.onMask.call( this, this.masked );
			var sUrl = this.options.onTransformUrlComponent.call( this, sUrlComponent );

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
						// could do an onError handler
						oData = jQuery.parseJSON( oData );
						notify( 'Error', oData.message, 'growl-error' );
					}
					else {
						var sCardContent = Utilities.extractScriptTags( oData );

						var sScript = Utilities.extractScript( oData );
						if ( sScript ) {
							sScript = "var oDeckard = $( 'div.deckard[data-deckard-uniqid=" + this.$oPack.attr('data-deckard-uniqid') + "]' ).data( 'plugin-deckard' );"
							+ "\n" + sScript;
						}
	//
						var $oNewKard = $( sCardContent );

						// Remove any kards with the same name in this pack
						var $oKards = $oNewKard.hasClass( 'kard' )? $oNewKard: $( 'div.kard', $oNewKard );
						var sNewKardName = $oKards.data( 'kard-name' );
						if ( sNewKardName ) {
							this.$oPack.find('div[data-kard-name="' + sNewKardName + '"]').remove();
						}

						var $oActiveCard = this.activeCard;

						$oNewKard.appendTo( this.$oPack );
						if ( !$oNewKard.attr( 'data-kard-uri' ) ) {
							$oNewKard.attr( 'data-kard-uri', sUrlComponent );
						}

						Utilities.applyScript( sScript );
						//Utilities.loadScriptTags( oData );

						// TODO: Here we need to analyse the data returned and save reference to the new card
						$oNewKard.find( 'a[data-kard-action],button[data-kard-action]' ).each(
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
				this.load( $oThis.data( 'deckard-default-kard' ) );
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

		var getId = (function () {
			var incrementingId = 0;
			//return function(element) {
			return function() {

				/*
				if (!element.id) {
					element.id = "id_" + incrementingId++;
					// Possibly add a check if this ID really is unique
				}
				return element.id;
				*/
				return incrementingId++;
			};
		}());

		return this.each(
			function () {
				// Restrict only one instance per element
				if ( !$.data( this, 'plugin-' + sPluginName ) ) {
					$.data( this, 'plugin-' + sPluginName, new Deckard( this, sAction ) );

					// Create a unique deckard ID. This is so we can get holdof the element any time
					$( this ).attr( 'data-deckard-uniqid', getId() );
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