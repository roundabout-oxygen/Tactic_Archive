package com.example.tacticalarchive.ui.main

import android.content.ContentValues
import android.content.Context
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
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation3.runtime.NavKey
import com.example.tacticalarchive.data.DefaultDataRepository

class WebAppInterface(private val context: Context) {
  @JavascriptInterface
  fun saveFile(base64Data: String, filename: String) {
    try {
      val bytes = Base64.decode(base64Data, Base64.DEFAULT)
      val resolver = context.contentResolver
      val mimeType = if (filename.endsWith(".json", ignoreCase = true)) {
        "application/json"
      } else if (filename.endsWith(".zip", ignoreCase = true)) {
        "application/zip"
      } else {
        "application/octet-stream"
      }
      
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val contentValues = ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
          put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
          put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
          put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
        if (uri != null) {
          resolver.openOutputStream(uri)?.use { outputStream ->
            outputStream.write(bytes)
          }
          contentValues.clear()
          contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
          resolver.update(uri, contentValues, null, null)
          Handler(Looper.getMainLooper()).post {
            Toast.makeText(context, "端末の「ダウンロード」フォルダに保存しました！\nファイル名: $filename", Toast.LENGTH_LONG).show()
          }
        }
      } else {
        val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val file = java.io.File(downloadsDir, filename)
        file.writeBytes(bytes)
        Handler(Looper.getMainLooper()).post {
          Toast.makeText(context, "ファイルをダウンロードフォルダに保存しました！\nファイル名: $filename", Toast.LENGTH_LONG).show()
        }
      }
    } catch (e: Exception) {
      e.printStackTrace()
      Handler(Looper.getMainLooper()).post {
        Toast.makeText(context, "保存失敗: ${e.message}", Toast.LENGTH_LONG).show()
      }
    }
  }
}

@Composable
fun MainScreen(
  onItemClick: (NavKey) -> Unit,
  modifier: Modifier = Modifier,
  viewModel: MainScreenViewModel = viewModel { MainScreenViewModel(DefaultDataRepository()) },
) {
  var filePathCallbackState by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }

  val launcher = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.OpenMultipleDocuments()
  ) { uris ->
    val uriArray = uris.map { it }.toTypedArray()
    filePathCallbackState?.onReceiveValue(if (uriArray.isNotEmpty()) uriArray else null)
    filePathCallbackState = null
  }

  AndroidView(
    factory = { context ->
      WebView(context).apply {
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
              val targetMimeTypes = if (acceptTypes != null && acceptTypes.isNotEmpty() && acceptTypes[0].isNotBlank()) {
                val raw = acceptTypes.joinToString(",").lowercase()
                if (raw.contains("json")) {
                  arrayOf("application/json", "application/octet-stream", "text/*", "*/*")
                } else if (raw.contains("zip")) {
                  arrayOf("application/zip", "application/x-zip-compressed", "application/octet-stream", "*/*")
                } else if (raw.contains("image")) {
                  arrayOf("image/*")
                } else {
                  arrayOf("*/*")
                }
              } else {
                arrayOf("*/*")
              }
              launcher.launch(targetMimeTypes)
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
