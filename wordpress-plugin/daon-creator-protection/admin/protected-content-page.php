<?php
/**
 * DAON Creator Protection — Protected Content admin page
 *
 * Lists all protected posts from the {prefix}_daon_protections table.
 *
 * @package DAON_Creator_Protection
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

global $wpdb;

$table_name = $wpdb->prefix . 'daon_protections';

// Pagination
$per_page     = 20;
$current_page = isset( $_GET['paged'] ) ? max( 1, intval( $_GET['paged'] ) ) : 1;
$offset       = ( $current_page - 1 ) * $per_page;

$total_items = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $table_name" );
$total_pages = ceil( $total_items / $per_page );

$protections = $wpdb->get_results( $wpdb->prepare(
    "SELECT p.*, pt.post_title, pt.post_status
     FROM $table_name p
     LEFT JOIN {$wpdb->posts} pt ON p.post_id = pt.ID
     ORDER BY p.protected_at DESC
     LIMIT %d OFFSET %d",
    $per_page,
    $offset
) );
?>

<div class="wrap">
    <h1 class="wp-heading-inline"><?php esc_html_e( 'DAON Protected Content', 'daon-creator-protection' ); ?></h1>
    <hr class="wp-header-end">

    <?php if ( empty( $protections ) ) : ?>
        <div class="notice notice-info">
            <p><?php esc_html_e( 'No content has been protected yet. Publish a post with auto-protect enabled or use the meta box in the editor.', 'daon-creator-protection' ); ?></p>
        </div>
    <?php else : ?>

    <table class="wp-list-table widefat fixed striped">
        <thead>
            <tr>
                <th scope="col" class="manage-column column-title column-primary" style="width:30%">
                    <?php esc_html_e( 'Post Title', 'daon-creator-protection' ); ?>
                </th>
                <th scope="col" class="manage-column" style="width:18%">
                    <?php esc_html_e( 'Content Hash', 'daon-creator-protection' ); ?>
                </th>
                <th scope="col" class="manage-column" style="width:14%">
                    <?php esc_html_e( 'License', 'daon-creator-protection' ); ?>
                </th>
                <th scope="col" class="manage-column" style="width:10%">
                    <?php esc_html_e( 'Status', 'daon-creator-protection' ); ?>
                </th>
                <th scope="col" class="manage-column" style="width:14%">
                    <?php esc_html_e( 'Protected Date', 'daon-creator-protection' ); ?>
                </th>
                <th scope="col" class="manage-column" style="width:14%">
                    <?php esc_html_e( 'Actions', 'daon-creator-protection' ); ?>
                </th>
            </tr>
        </thead>
        <tbody>
        <?php foreach ( $protections as $row ) :
            $post_title = $row->post_title ? $row->post_title : __( '(deleted post)', 'daon-creator-protection' );
            $edit_link  = $row->post_title ? get_edit_post_link( $row->post_id ) : '';
            $hash_short = substr( $row->content_hash, 0, 12 ) . '...';

            $license_labels = array(
                'liberation_v1'      => __( 'Liberation v1', 'daon-creator-protection' ),
                'cc_by_nc'           => __( 'CC BY-NC', 'daon-creator-protection' ),
                'cc_by_nc_sa'        => __( 'CC BY-NC-SA', 'daon-creator-protection' ),
                'all_rights_reserved'=> __( 'All Rights Reserved', 'daon-creator-protection' ),
            );
            $license_text = isset( $license_labels[ $row->license ] ) ? $license_labels[ $row->license ] : ucfirst( str_replace( '_', ' ', $row->license ) );

            $status_label = ucfirst( $row->status );
            switch ( $row->status ) {
                case 'verified':
                    $status_html = '<span style="color:#16a34a;font-weight:600">' . esc_html( $status_label ) . '</span>';
                    break;
                case 'error':
                    $status_html = '<span style="color:#dc2626;font-weight:600">' . esc_html( $status_label ) . '</span>';
                    break;
                default:
                    $status_html = '<span style="color:#d97706">' . esc_html( $status_label ) . '</span>';
            }

            $protected_date = date_i18n( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), strtotime( $row->protected_at ) );
        ?>
            <tr>
                <td class="column-title column-primary">
                    <?php if ( $edit_link ) : ?>
                        <strong><a href="<?php echo esc_url( $edit_link ); ?>"><?php echo esc_html( $post_title ); ?></a></strong>
                    <?php else : ?>
                        <strong><?php echo esc_html( $post_title ); ?></strong>
                    <?php endif; ?>
                </td>
                <td>
                    <code title="<?php echo esc_attr( $row->content_hash ); ?>"><?php echo esc_html( $hash_short ); ?></code>
                </td>
                <td><?php echo esc_html( $license_text ); ?></td>
                <td><?php echo $status_html; // already escaped ?></td>
                <td><?php echo esc_html( $protected_date ); ?></td>
                <td>
                    <?php if ( $row->verification_url ) : ?>
                        <a href="<?php echo esc_url( $row->verification_url ); ?>" target="_blank" class="button button-small">
                            <?php esc_html_e( 'Verify', 'daon-creator-protection' ); ?>
                        </a>
                    <?php elseif ( $row->status === 'error' && $row->post_title ) : ?>
                        <button type="button" class="button button-small daon-retry-protection" data-post-id="<?php echo esc_attr( $row->post_id ); ?>">
                            <?php esc_html_e( 'Retry', 'daon-creator-protection' ); ?>
                        </button>
                    <?php else : ?>
                        &mdash;
                    <?php endif; ?>
                </td>
            </tr>
        <?php endforeach; ?>
        </tbody>
        <tfoot>
            <tr>
                <th scope="col" class="manage-column column-title column-primary"><?php esc_html_e( 'Post Title', 'daon-creator-protection' ); ?></th>
                <th scope="col" class="manage-column"><?php esc_html_e( 'Content Hash', 'daon-creator-protection' ); ?></th>
                <th scope="col" class="manage-column"><?php esc_html_e( 'License', 'daon-creator-protection' ); ?></th>
                <th scope="col" class="manage-column"><?php esc_html_e( 'Status', 'daon-creator-protection' ); ?></th>
                <th scope="col" class="manage-column"><?php esc_html_e( 'Protected Date', 'daon-creator-protection' ); ?></th>
                <th scope="col" class="manage-column"><?php esc_html_e( 'Actions', 'daon-creator-protection' ); ?></th>
            </tr>
        </tfoot>
    </table>

    <?php if ( $total_pages > 1 ) : ?>
        <div class="tablenav bottom">
            <div class="tablenav-pages">
                <span class="displaying-num">
                    <?php printf( _n( '%s item', '%s items', $total_items, 'daon-creator-protection' ), number_format_i18n( $total_items ) ); ?>
                </span>
                <?php
                echo paginate_links( array(
                    'base'      => add_query_arg( 'paged', '%#%' ),
                    'format'    => '',
                    'prev_text' => '&laquo;',
                    'next_text' => '&raquo;',
                    'total'     => $total_pages,
                    'current'   => $current_page,
                ) );
                ?>
            </div>
        </div>
    <?php endif; ?>

    <?php endif; ?>
</div>
