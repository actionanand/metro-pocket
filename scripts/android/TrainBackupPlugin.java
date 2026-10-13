package com.actionanand.metropocket.app;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** Storage Access Framework: explicit user-selected files, without storage permission. */
@CapacitorPlugin(name = "TrainBackup")
public class TrainBackupPlugin extends Plugin {
  private static final int MAX_BYTES = 20 * 1024 * 1024;
  private byte[] pendingBackup;
  private volatile boolean busy;

  @PluginMethod
  public void saveDatabase(PluginCall call) {
    if (busy) { call.reject("Another Train backup file operation is in progress."); return; }
    String encoded = call.getString("base64");
    String filename = call.getString("filename");
    if (encoded == null || filename == null || !filename.matches("metropocket-trains-backup-[0-9]{4}-[0-9]{2}-[0-9]{2}\\.db") || encoded.length() > ((MAX_BYTES + 2L) / 3L) * 4L) {
      call.reject("Invalid Train backup file or size."); return;
    }
    try {
      pendingBackup = Base64.decode(encoded, Base64.DEFAULT);
      if (pendingBackup.length > MAX_BYTES) throw new IllegalArgumentException("Train backup exceeds 20 MB.");
      busy = true;
      Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
      intent.addCategory(Intent.CATEGORY_OPENABLE);
      intent.setType("application/x-sqlite3");
      intent.putExtra(Intent.EXTRA_TITLE, filename);
      startActivityForResult(call, intent, "savedDatabase");
    } catch (Exception error) { pendingBackup = null; busy = false; call.reject("Unable to choose a Train backup destination.", error); }
  }

  @ActivityCallback
  private void savedDatabase(PluginCall call, ActivityResult result) {
    if (call == null) { pendingBackup = null; busy = false; return; }
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
      pendingBackup = null; busy = false; call.resolve(new JSObject().put("cancelled", true)); return;
    }
    Uri uri = result.getData().getData();
    byte[] bytes = pendingBackup;
    pendingBackup = null;
    execute(() -> {
      try {
        if (bytes == null) throw new IllegalStateException("Backup saving was interrupted. Try again.");
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
          if (output == null) throw new IllegalStateException("The backup destination could not be opened.");
          output.write(bytes);
          output.flush();
        }
        call.resolve(new JSObject().put("cancelled", false));
      } catch (Exception error) { call.reject("Unable to save the Train backup file.", error); }
      finally { busy = false; }
    });
  }

  @PluginMethod
  public void openDatabase(PluginCall call) {
    if (busy) { call.reject("Another Train backup file operation is in progress."); return; }
    busy = true;
    try {
      Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
      intent.addCategory(Intent.CATEGORY_OPENABLE);
      // Providers use several MIME types for .db files. Identity is checked in
      // the shared SQLite validator, never inferred from MIME or filename.
      intent.setType("*/*");
      startActivityForResult(call, intent, "openedDatabase");
    } catch (Exception error) { busy = false; call.reject("Unable to open the Train backup picker.", error); }
  }

  @ActivityCallback
  private void openedDatabase(PluginCall call, ActivityResult result) {
    if (call == null) { busy = false; return; }
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
      busy = false; call.resolve(new JSObject().put("cancelled", true)); return;
    }
    Uri uri = result.getData().getData();
    execute(() -> {
      try {
        String encoded;
        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
          if (input == null) throw new IllegalStateException("The selected file could not be read.");
          byte[] buffer = new byte[8192];
          int read;
          while ((read = input.read(buffer)) != -1) {
            if ((long) output.size() + read > MAX_BYTES) throw new IllegalArgumentException("Train backup exceeds 20 MB.");
            output.write(buffer, 0, read);
          }
          encoded = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
        }
        String filename = "train-backup.db";
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
          if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) filename = cursor.getString(0);
        }
        JSObject response = new JSObject();
        response.put("cancelled", false);
        response.put("filename", filename);
        response.put("base64", encoded);
        call.resolve(response);
      } catch (Exception error) { call.reject("Unable to read the Train backup file (maximum 20 MB).", error); }
      finally { busy = false; }
    });
  }
}
