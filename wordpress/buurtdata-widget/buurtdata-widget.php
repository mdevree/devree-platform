<?php
/**
 * Plugin Name: De Vree Buurtdata Widget
 * Plugin URI:  https://www.devreemakelaardij.nl
 * Description: Embed het buurtdata lead generator rapport op elke pagina via shortcode [buurtdata_rapport].
 * Version:     1.0.0
 * Author:      De Vree Makelaardij
 * License:     GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * URL van het Next.js platform. Stel dit in als constante in wp-config.php:
 *   define( 'DEVREE_PLATFORM_URL', 'https://platform.devreemakelaardij.nl' );
 * of laat de standaard staan.
 */
if ( ! defined( 'DEVREE_PLATFORM_URL' ) ) {
    define( 'DEVREE_PLATFORM_URL', 'https://platform.devreemakelaardij.nl' );
}

/**
 * Shortcode: [buurtdata_rapport]
 *
 * Opties:
 *   hoogte     - Minimale iframe hoogte in pixels (standaard: 800)
 *   class      - Extra CSS-klasse op de wrapper div
 *
 * Voorbeeld:
 *   [buurtdata_rapport hoogte="900"]
 */
function devree_buurtdata_shortcode( $atts ) {
    $atts = shortcode_atts(
        array(
            'hoogte' => '800',
            'class'  => '',
        ),
        $atts,
        'buurtdata_rapport'
    );

    $iframe_url = trailingslashit( DEVREE_PLATFORM_URL ) . 'buurtdata-rapport';
    $iframe_id  = 'devree-buurtdata-' . wp_generate_uuid4();
    $min_height = absint( $atts['hoogte'] );
    $extra_class = sanitize_html_class( $atts['class'] );

    ob_start();
    ?>
    <div class="devree-buurtdata-wrapper <?php echo esc_attr( $extra_class ); ?>" style="width:100%;overflow:hidden;">
        <iframe
            id="<?php echo esc_attr( $iframe_id ); ?>"
            src="<?php echo esc_url( $iframe_url ); ?>"
            width="100%"
            height="<?php echo esc_attr( $min_height ); ?>"
            frameborder="0"
            scrolling="no"
            loading="lazy"
            style="border:none;width:100%;min-height:<?php echo esc_attr( $min_height ); ?>px;display:block;"
            title="<?php esc_attr_e( 'Gratis buurtrapport - De Vree Makelaardij', 'devree-buurtdata' ); ?>"
            allow="clipboard-write"
        ></iframe>
    </div>
    <script>
    (function () {
        var iframeId = <?php echo wp_json_encode( $iframe_id ); ?>;
        var minHeight = <?php echo (int) $min_height; ?>;

        window.addEventListener('message', function (event) {
            if (
                event.data &&
                event.data.type === 'devree-buurtdata-resize' &&
                typeof event.data.height === 'number'
            ) {
                var iframe = document.getElementById(iframeId);
                if (iframe) {
                    var newHeight = Math.max(minHeight, event.data.height + 40);
                    iframe.style.height = newHeight + 'px';
                }
            }
        });
    })();
    </script>
    <?php
    return ob_get_clean();
}

add_shortcode( 'buurtdata_rapport', 'devree_buurtdata_shortcode' );

/**
 * Gutenberg blok (optioneel): voeg de shortcode in als klassiek blok.
 * Gebruikers kunnen ook gewoon de [buurtdata_rapport] shortcode in een
 * 'Shortcode'-blok of klassieke editor plakken.
 */
