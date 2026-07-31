/**
 * DAON Creator Protection — Admin JS
 *
 * AJAX handlers for protect / verify buttons in the post editor.
 * Expects `daon_ajax` to be localized via wp_localize_script with:
 *   ajax_url, nonce, strings { protecting, protected, error, verifying, verified }
 */

/* global jQuery, daon_ajax */

if ( typeof daon_ajax === 'undefined' ) {
    // Nothing to do — script was enqueued on a page without the localized data.
} else {
    (function ( $ ) {
        'use strict';

        /**
         * Protect Post (initial or retry)
         */
        function handleProtect( e ) {
            e.preventDefault();

            var $btn    = $( this ),
                postId  = $btn.data( 'post-id' ),
                license = $( '#daon_license' ).val() || 'liberation_v1',
                origText = $btn.text();

            $btn.prop( 'disabled', true ).text( daon_ajax.strings.protecting );

            $.post( daon_ajax.ajax_url, {
                action:  'daon_protect_post',
                nonce:   daon_ajax.nonce,
                post_id: postId,
                license: license
            } )
            .done( function ( res ) {
                if ( res.success ) {
                    $btn.text( daon_ajax.strings.protected )
                        .removeClass( 'button-primary' )
                        .addClass( 'button-disabled' );

                    // Refresh the meta-box area after a short pause so the user
                    // sees the success state before the page reloads.
                    setTimeout( function () {
                        window.location.reload();
                    }, 800 );
                } else {
                    $btn.prop( 'disabled', false ).text( origText );
                    showNotice( res.data && res.data.message ? res.data.message : daon_ajax.strings.error, 'error' );
                }
            } )
            .fail( function () {
                $btn.prop( 'disabled', false ).text( origText );
                showNotice( daon_ajax.strings.error, 'error' );
            } );
        }

        /**
         * Verify Post
         */
        function handleVerify( e ) {
            e.preventDefault();

            var $btn    = $( this ),
                postId  = $btn.data( 'post-id' ),
                origText = $btn.text();

            $btn.prop( 'disabled', true ).text( daon_ajax.strings.verifying );

            $.post( daon_ajax.ajax_url, {
                action:  'daon_verify_post',
                nonce:   daon_ajax.nonce,
                post_id: postId
            } )
            .done( function ( res ) {
                if ( res.success ) {
                    $btn.text( daon_ajax.strings.verified );
                    if ( res.data && res.data.verified ) {
                        showNotice( daon_ajax.strings.verified, 'success' );
                    }
                } else {
                    $btn.prop( 'disabled', false ).text( origText );
                    showNotice( res.data && res.data.message ? res.data.message : daon_ajax.strings.error, 'error' );
                }
            } )
            .fail( function () {
                $btn.prop( 'disabled', false ).text( origText );
                showNotice( daon_ajax.strings.error, 'error' );
            } );
        }

        /**
         * Show a transient admin notice inside #daon-meta-box-content
         */
        function showNotice( message, type ) {
            var cssClass = type === 'error' ? 'notice-error' : 'notice-success';
            var $notice  = $( '<div class="notice ' + cssClass + ' inline" style="margin:8px 0"><p>' + $('<span>').text( message ).html() + '</p></div>' );

            $( '#daon-meta-box-content' ).prepend( $notice );

            setTimeout( function () {
                $notice.fadeOut( 300, function () {
                    $notice.remove();
                } );
            }, 4000 );
        }

        // Bind events (using delegation so dynamically loaded content works)
        $( document )
            .on( 'click', '.daon-protect-post',    handleProtect )
            .on( 'click', '.daon-retry-protection', handleProtect )
            .on( 'click', '.daon-verify-post',      handleVerify );

    } )( jQuery );
}
