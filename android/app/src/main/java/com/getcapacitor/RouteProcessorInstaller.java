package com.getcapacitor;

/**
 * Bridges into Capacitor's package-private {@link Bridge#setRouteProcessor}.
 *
 * <p>{@code Bridge.setRouteProcessor} has package-private visibility, and
 * {@link BridgeActivity} never exposes the {@code Bridge.Builder} that offers a
 * public setter. This thin shim lives in the {@code com.getcapacitor} package so
 * it can install a {@link RouteProcessor} on an already-constructed bridge from
 * application code.
 */
public final class RouteProcessorInstaller {

    private RouteProcessorInstaller() {}

    public static void install(Bridge bridge, RouteProcessor processor) {
        if (bridge != null) {
            bridge.setRouteProcessor(processor);
        }
    }
}
