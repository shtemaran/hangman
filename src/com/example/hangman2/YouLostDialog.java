package com.example.hangman2;

import android.os.Bundle;
import android.app.Activity;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.View.OnClickListener;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.TextView;
import android.support.v4.app.NavUtils;
import android.annotation.TargetApi;
import android.content.Intent;
import android.os.Build;

public class YouLostDialog extends Activity {
	
	String score,mode;
	
	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		setContentView(R.layout.activity_you_lost_dialog);
		// Show the Up button in the action bar.
		
		Intent myIntent = getIntent(); // gets the previously created intent		
		mode=myIntent.getStringExtra("mode");
		((TextView)(findViewById(R.id.score))).setText(myIntent.getStringExtra("score"));
		
		((ImageView)(findViewById(R.id.menu))).setOnClickListener(menuButtonPress);
		((ImageView)(findViewById(R.id.playAgain))).setOnClickListener(playAgainButtonPress);
	}

	private OnClickListener menuButtonPress = new OnClickListener() {	    
		public void onClick(View v) {
			Intent myIntent = new Intent(YouLostDialog.this, MenuActivity.class);
			myIntent.putExtra("mode", ""); //Optional parameters
			YouLostDialog.this.startActivity(myIntent);	
	    }
	};
	private OnClickListener playAgainButtonPress = new OnClickListener() {	    
		public void onClick(View v) {
			Intent myIntent = new Intent(YouLostDialog.this, MainActivity.class);
			myIntent.putExtra("mode",mode ); //Optional parameters
			YouLostDialog.this.startActivity(myIntent);	
	    }
	};
	@Override
	public boolean onCreateOptionsMenu(Menu menu) {
		// Inflate the menu; this adds items to the action bar if it is present.
		getMenuInflater().inflate(R.menu.you_lost_dialog, menu);
		return true;
	}



}
