<?php
declare(strict_types=1);
namespace BrianAzukaeme\AIDiagnosticBridge\Diagnostics;
use BrianAzukaeme\AIDiagnosticBridge\Response;

final class WooCommerce {
	public static function run(): array {
		if ( ! class_exists( 'WooCommerce' ) && ! defined( 'WC_VERSION' ) ) {
			return Response::success( 'woocommerce', 'not_applicable', [], [ 'installed' => false ] );
		}
		$gateways = function_exists( 'WC' ) && WC()->payment_gateways() ? WC()->payment_gateways()->get_available_payment_gateways() : [];
		return Response::success( 'woocommerce', 'ok', [], [ 'installed' => true, 'version' => defined( 'WC_VERSION' ) ? WC_VERSION : '', 'currency' => function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : '', 'payment_gateway_count' => count( (array) $gateways ), 'cart_page_id' => function_exists( 'wc_get_page_id' ) ? wc_get_page_id( 'cart' ) : 0, 'checkout_page_id' => function_exists( 'wc_get_page_id' ) ? wc_get_page_id( 'checkout' ) : 0, 'shop_page_id' => function_exists( 'wc_get_page_id' ) ? wc_get_page_id( 'shop' ) : 0 ] );
	}
}

