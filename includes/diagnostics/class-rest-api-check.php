<?php
declare(strict_types=1);
namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;
use BrianAzukaeme\AIDiagnosticBridge\Response;

final class REST_API_Check {
	public static function run(): array {
		$url = rest_url();
		$response = wp_remote_get( $url, [ 'timeout' => 5, 'limit_response_size' => 4096, 'redirection' => 0 ] );
		if ( is_wp_error( $response ) ) {
			return Response::success( 'rest-api', 'error', [ Response::finding( 'rest-unavailable', 'high', 'rest_api', 'REST API request failed', 'WordPress returned an error while checking its REST API.', [ 'error' => 'request_failed' ], 'wordpress' ) ], [ 'url' => esc_url_raw( $url ) ] );
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$status = $code >= 200 && $code < 300 ? 'ok' : 'warning';
		$findings = $status === 'ok' ? [] : [ Response::finding( 'rest-http-error', 'high', 'rest_api', 'REST API returned an unexpected status', 'The internal REST API check returned a non-success HTTP status.', [ 'http_status' => $code ], 'wordpress' ) ];
		return Response::success( 'rest-api', $status, $findings, [ 'url' => esc_url_raw( $url ), 'http_status' => $code, 'namespaces' => array_values( rest_get_server()->get_namespaces() ) ] );
	}
}

