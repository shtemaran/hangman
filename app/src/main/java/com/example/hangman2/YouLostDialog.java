package com.example.hangman2;

import android.os.Bundle;
import android.app.Activity;
import android.view.Menu;
import android.view.View;
import android.view.View.OnClickListener;
import android.widget.ImageView;
import android.widget.TextView;
import android.content.Intent;
import android.content.SharedPreferences;

public class YouLostDialog extends Activity {
	
	String score,mode;
	
	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		setContentView(R.layout.activity_you_lost_dialog);
		// Show the Up button in the action bar.
		
		
		
		Intent myIntent = getIntent(); // gets the previously created intent		
		mode=myIntent.getStringExtra("mode");
		
		int currentScore=Integer.parseInt(myIntent.getStringExtra("score"));
		((TextView)(findViewById(R.id.score))).setText(myIntent.getStringExtra("score"));
		
		SharedPreferences sharedPref = YouLostDialog.this.getPreferences(getApplicationContext().MODE_PRIVATE);
		String str=getString(R.string.saved_high_score);
		int isHighscore=scoreKeeper.updateHighscore(currentScore, sharedPref, str);
		
		if (isHighscore == 1)
			((ImageView)(findViewById(R.id.personImage))).setImageResource(R.drawable.happymarduk);
		
		
		((ImageView)(findViewById(R.id.menu))).setOnClickListener(menuButtonPress);
		((ImageView)(findViewById(R.id.playAgain))).setOnClickListener(playAgainButtonPress);
	}

	private OnClickListener menuButtonPress = new OnClickListener() {	    
		public void onClick(View v) {
			Intent myIntent = new Intent(YouLostDialog.this, MenuActivity.class);			
			YouLostDialog.this.startActivity(myIntent);	
			YouLostDialog.this.finish();
	    }
	};
	private OnClickListener playAgainButtonPress = new OnClickListener() {	    
		public void onClick(View v) {
			Intent myIntent = new Intent(YouLostDialog.this, MainActivity.class);
			myIntent.putExtra("mode",mode ); //Optional parameters
			YouLostDialog.this.startActivity(myIntent);	
			YouLostDialog.this.finish();
	    }
	};
	@Override
	public boolean onCreateOptionsMenu(Menu menu) {
		// Inflate the menu; this adds items to the action bar if it is present.
		getMenuInflater().inflate(R.menu.you_lost_dialog, menu);
		return true;
	}
	@Override
	public void onBackPressed() {	   
		Intent myIntent = new Intent(YouLostDialog.this, MenuActivity.class);			
		YouLostDialog.this.startActivity(myIntent);	
		YouLostDialog.this.finish();
	}


}
