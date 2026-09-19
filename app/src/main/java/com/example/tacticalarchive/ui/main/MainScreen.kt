package com.example.tacticalarchive.ui.main

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation3.runtime.NavKey
import com.example.tacticalarchive.data.DefaultDataRepository

import android.media.MediaScannerConnection
import java.io.File
import java.io.FileOutputStream

class WebAppInterface(private val context: Context) {

  @JavascriptInterface
  fun saveTextFile(textData: String, filename: String): String {
    return writeBytesToDownload(textData.toByteArray(Charsets.UTF_8), filename)
  }

  @JavascriptInterface
  fun saveFile(base64Data: String, filename: String): String {
    return try {
      val bytes = Base64.decode(base64Data, Base64.DEFAULT)
      writeBytesToDownload(bytes, filename)
    } catch (t: Throwable) {
      t.printStackTrace()
      val err = "Base64デコード失敗: ${t.message ?: t.javaClass.simpleName}"
      Handler(Looper.getMainLooper()).post {
        Toast.makeText(context, err, Toast.LENGTH_LONG).show()
      }
      "ERROR: $err"
    }
  }

  private fun writeBytesToDownload(bytes: ByteArray, filename: String): String {
    try {
      val mimeType = when {
        filename.endsWith(".json", ignoreCase = true) -> "application/json"
        filename.endsWith(".csv", ignoreCase = true) -> "text/csv"
        filename.endsWith(".zip", ignoreCase = true) -> "application/zip"
        filename.endsWith(".txt", ignoreCase = true) -> "text/plain"
        else -> "application/octet-stream"
      }

      var savedSuccessfully = false
      var savedLocation = "ダウンロード (Download)"

      // 1. Android 10+ (API 29+) MediaStore による保存
      // ※ IS_PENDING を指定すると更新失敗時に端末から不可視になるバグがあるため、IS_PENDING は付けずに直接書き込みます
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        try {
          val contentValues = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
          }
          val resolver = context.contentResolver
          val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
          if (uri != null) {
            resolver.openOutputStream(uri, "w")?.use { outputStream ->
              outputStream.write(bytes)
              outputStream.flush()
            }
            savedSuccessfully = true
          }
        } catch (e: Exception) {
          e.printStackTrace()
        }
      }

      // 2. MediaStore で書き込めなかった場合、または Android 9 以前の場合のフォールバック
      if (!savedSuccessfully) {
        try {
          val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
          if (!downloadsDir.exists()) {
            downloadsDir.mkdirs()
          }
          val destFile = File(downloadsDir, filename)
          FileOutputStream(destFile).use { fos ->
            fos.write(bytes)
            fos.flush()
          }
          // メディアスキャナーで即座にインデックス登録（ファイルマネージャーに即時反映）
          MediaScannerConnection.scanFile(
            context,
            arrayOf(destFile.absolutePath),
            arrayOf(mimeType),
            null
          )
          savedSuccessfully = true
          savedLocation = destFile.absolutePath
        } catch (e: Exception) {
          e.printStackTrace()
        }
      }

      // 3. 上記両方とも失敗した場合のフォールバック (アプリ専用外部ストレージ)
      if (!savedSuccessfully) {
        val fallbackDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
        val fallbackFile = File(fallbackDir, filename)
        FileOutputStream(fallbackFile).use { fos ->
          fos.write(bytes)
          fos.flush()
        }
        savedSuccessfully = true
        savedLocation = "アプリ領域 (${fallbackFile.name})"
      }

      Handler(Looper.getMainLooper()).post {
        Toast.makeText(
          context,
          "ファイルを保存しました！\n場所: $savedLocation\nファイル名: $filename",
          Toast.LENGTH_LONG
        ).show()
      }
      return "SUCCESS"

    } catch (t: Throwable) {
      t.printStackTrace()
      val err = "保存失敗: ${t.message ?: t.javaClass.simpleName}"
      Handler(Looper.getMainLooper()).post {
        Toast.makeText(context, err, Toast.LENGTH_LONG).show()
      }
      return "ERROR: $err"
    }
  }
}

@Composable
fun MainScreen(
  onItemClick: (NavKey) -> Unit,
  modifier: Modifier = Modifier,
  viewModel: MainScreenViewModel = viewModel { MainScreenViewModel(DefaultDataRepository()) },
) {
  val context = LocalContext.current
  var filePathCallbackState by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
  var webViewInstance by remember { mutableStateOf<WebView?>(null) }

  // 端末の戻る操作（ハードウェアキー／スワイプジェスチャー）でモーダルを閉じる
  BackHandler {
    webViewInstance?.evaluateJavascript("""
      (function() {
        const activeModal = document.querySelector('.modal-overlay.active');
        if (activeModal) {
          const closeBtn = activeModal.querySelector('.modal-close-btn, #btn-review-cancel, #btn-detail-cancel, #btn-rename-close, #btn-csv-modal-close, #btn-backup-close, #btn-restore-close');
          if (closeBtn) {
            closeBtn.click();
          } else {
            activeModal.classList.remove('active');
          }
          return true;
        }
        const tagPopup = document.getElementById('custom-tag-popup');
        if (tagPopup && tagPopup.style.display !== 'none') {
          tagPopup.style.display = 'none';
          return true;
        }
        return false;
      })();
    """.trimIndent()) { result ->
      val handled = result == "true" || result == "\"true\""
      if (!handled) {
        if (webViewInstance?.canGoBack() == true) {
          webViewInstance?.goBack()
        } else {
          (context as? android.app.Activity)?.finish()
        }
      }
    }
  }

  val launcher = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.StartActivityForResult()
  ) { result ->
    if (result.resultCode == android.app.Activity.RESULT_OK && result.data != null) {
      val data = result.data!!
      val uris = mutableListOf<Uri>()
      val clipData = data.clipData
      if (clipData != null) {
        for (i in 0 until clipData.itemCount) {
          uris.add(clipData.getItemAt(i).uri)
        }
      } else if (data.data != null) {
        uris.add(data.data!!)
      }
      filePathCallbackState?.onReceiveValue(if (uris.isNotEmpty()) uris.toTypedArray() else null)
    } else {
      filePathCallbackState?.onReceiveValue(null)
    }
    filePathCallbackState = null
  }

  AndroidView(
    factory = { ctx ->
      WebView(ctx).apply {
        webViewInstance = this
        layoutParams = ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT
        )
        webViewClient = WebViewClient()
        webChromeClient = object : WebChromeClient() {
          override fun onShowFileChooser(
            webView: WebView?,
            filePathCallback: ValueCallback<Array<Uri>>?,
            fileChooserParams: FileChooserParams?
          ): Boolean {
            filePathCallbackState?.onReceiveValue(null)
            filePathCallbackState = filePathCallback
            try {
              val acceptTypes = fileChooserParams?.acceptTypes
              val mimeType = if (acceptTypes != null && acceptTypes.isNotEmpty() && acceptTypes[0].isNotBlank()) {
                val raw = acceptTypes.joinToString(",").lowercase()
                if (raw.contains("json")) "application/json"
                else if (raw.contains("zip")) "application/zip"
                else if (raw.contains("image")) "image/*"
                else "*/*"
              } else {
                "*/*"
              }

              // ACTION_OPEN_DOCUMENT を使用して全画面の横向き対応ファイルピッカーを起動
              // （縦向き用の Photo Picker ボトムシートが狭く表示されるのを防止）
              val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = mimeType
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                if (mimeType == "*/*") {
                  putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/*", "application/json", "application/zip", "*/*"))
                }
              }
              launcher.launch(intent)
            } catch (e: Exception) {
              filePathCallbackState?.onReceiveValue(null)
              filePathCallbackState = null
              return false
            }
            return true
          }
        }
        setBackgroundColor(android.graphics.Color.parseColor("#0e1e30"))
        setLayerType(android.view.View.LAYER_TYPE_NONE, null)
        settings.apply {
          javaScriptEnabled = true
          domStorageEnabled = true
          databaseEnabled = true
          allowFileAccess = true
          allowContentAccess = true
          allowFileAccessFromFileURLs = true
          allowUniversalAccessFromFileURLs = true
          useWideViewPort = true
          loadWithOverviewMode = true
        }
        addJavascriptInterface(WebAppInterface(context), "AndroidApp")
        loadUrl("file:///android_asset/index.html")
      }
    },
    modifier = modifier.fillMaxSize()
  )
}
