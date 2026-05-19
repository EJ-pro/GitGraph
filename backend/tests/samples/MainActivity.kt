package com.app

import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.widget.TextView
import android.view.View

/**
 * Main entry point of the application.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var titleView: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        titleView = findViewById(R.id.title)
    }

    override fun onResume() {
        super.onResume()
        titleView.text = "Welcome"
    }

    fun onButtonClick(view: View) {
        startActivity(intent)
    }
}

class ProfileActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
    }
}

fun greet(name: String): String = "Hello, $name"

fun formatDate(millis: Long): String = millis.toString()
