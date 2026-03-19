package pub.ditto.app;

import android.content.Context;
import android.util.Log;

import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/**
 * Schedules and cancels the periodic NotificationWorker via WorkManager.
 *
 * Call {@link #schedule(Context)} when the user logs in or config changes,
 * and {@link #cancel(Context)} when the user logs out or disables notifications.
 */
public final class NotificationScheduler {

    private static final String TAG = "NotificationScheduler";
    private static final String WORK_NAME = "ditto_notification_poll";

    /** Minimum interval for PeriodicWorkRequest (Android enforces 15 min floor). */
    private static final long POLL_INTERVAL_MINUTES = 15;

    private NotificationScheduler() {}

    /**
     * Schedule periodic notification polling. Safe to call multiple times —
     * KEEP policy ensures the existing worker continues if already scheduled.
     */
    public static void schedule(Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        PeriodicWorkRequest workRequest = new PeriodicWorkRequest.Builder(
                NotificationWorker.class,
                POLL_INTERVAL_MINUTES, TimeUnit.MINUTES
        )
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                workRequest
        );

        Log.d(TAG, "Notification polling scheduled (every " + POLL_INTERVAL_MINUTES + " min)");
    }

    /**
     * Cancel periodic notification polling (e.g. on logout).
     */
    public static void cancel(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME);
        Log.d(TAG, "Notification polling cancelled");
    }
}
