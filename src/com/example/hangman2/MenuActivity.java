package com.example.hangman2;

import android.os.Bundle;
import android.app.Activity;
import android.content.Intent;
import android.view.Menu;
import android.view.View;
import android.view.View.OnClickListener;
import android.widget.Button;


public class MenuActivity extends Activity {

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		setContentView(R.layout.activity_menu);
		
		(findViewById(R.id.easyButton)).setOnClickListener(startGameButtonClick);
		(findViewById(R.id.mediumButton)).setOnClickListener(startGameButtonClick);
		(findViewById(R.id.hardButton)).setOnClickListener(startGameButtonClick);
		(findViewById(R.id.exitButton)).setOnClickListener(exitButtonClick);
				
	}

	private OnClickListener startGameButtonClick = new OnClickListener() {	    
		public void onClick(View v) {
			String mode=((Button)(v)).getText().toString();
			Intent myIntent = new Intent(MenuActivity.this, MainActivity.class);
			myIntent.putExtra("mode", mode); //Optional parameters
			MenuActivity.this.startActivity(myIntent);			
	    }
	};
	private OnClickListener exitButtonClick = new OnClickListener() {	    
		public void onClick(View v) {
			System.exit(0);			
	    }
	};
	
	
	@Override
	public boolean onCreateOptionsMenu(Menu menu) {
		// Inflate the menu; this adds items to the action bar if it is present.
		getMenuInflater().inflate(R.menu.menu, menu);
		return true;
	}

}
