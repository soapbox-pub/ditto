package com.mew.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register the native notification config plugin before super.onCreate
        registerPlugin(MewNotificationPlugin.class);

        super.onCreate(savedInstanceState);

        // Start the persistent relay connection service
        Intent serviceIntent = new Intent(this, NotificationRelayService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
    }
}
