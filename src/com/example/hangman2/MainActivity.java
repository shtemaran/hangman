package com.example.hangman2;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UnsupportedEncodingException;
import java.util.Arrays;
import java.util.Collections;

import android.R.color;
import android.app.ActionBar.LayoutParams;
import android.app.Activity;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Point;
import android.graphics.Typeface;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.media.Image;
import android.os.Bundle;
import android.os.Handler;
import android.provider.ContactsContract.CommonDataKinds.Im;
import android.util.Log;
import android.util.TypedValue;
import android.view.Display;
import android.view.Gravity;
import android.view.Menu;
import android.view.View;
import android.view.View.OnClickListener;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TableLayout;
import android.widget.TableRow;
import android.widget.TextView;
import android.widget.Toast;


import com.example.hangman2.question;




public class MainActivity extends Activity {
	
	Typeface typeface;
	question currentWord;
	int currentCount,score=0,currentQuestionNumber=0,lifeCounter;
	TextView questionContainer;
	LinearLayout letterContainer;
	TableLayout keyboardContainer;
	TextView scoreContainer;
	int displayWidth;
	question[] questions;
	String mode;
	int allowedSkipCount,skipCount;
	ImageView personContainer;
	
	
	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		Intent myIntent = getIntent(); // gets the previously created intent
		mode = myIntent.getStringExtra("mode");
		
		//personContainer=(ImageView)(findViewById(R.id.personContainer));       
		
		setContentView(R.layout.activity_main);
		scoreContainer=(TextView)(findViewById(R.id.score));
		questionContainer=(TextView)(findViewById(R.id.questionContainer));
		letterContainer = (LinearLayout)(findViewById(R.id.letterContainer));
		typeface = Typeface.createFromAsset(getAssets(), "fonts/arnamu.ttf");
		
		lifeCounter=14;
		
		initQuestions();
		initKeyboard();
		initSkip();
				
		Display display = getWindowManager().getDefaultDisplay();
    	displayWidth=display.getWidth();
		
    	scoreContainer.setText("Հաշիվ: 0");
		nextWord();

	//	((Button)(findViewById(R.id.nextTmpButton))).setText(mode);
	}
	
	private void initSkip()
	{
		LinearLayout skipCountContainer=(LinearLayout)findViewById(R.id.skipCountContainer);
		skipCountContainer.setClickable(true);
		skipCountContainer.setOnClickListener(skipButtonPress);
		allowedSkipCount=0;
		if(mode.equals("easy"))
			allowedSkipCount=4;
		else if(mode.equals("medium"))
		{
			skipCountContainer.removeViewAt(0);
			skipCountContainer.removeViewAt(1);
			allowedSkipCount=2;
		}
		else if(mode.equals("hard"))
		{
			skipCountContainer.removeAllViews();
			allowedSkipCount=0;
		}
		
	}
	
	private void initQuestions()
	{
		questions=questionDatabase.getArray();
		currentQuestionNumber=-1;
	}
	
	@SuppressWarnings("deprecation")
	private void initKeyboard()
	{
		int i,j;
		String[][] keyboardLayout=new String[][]{
				{"է", "թ", "փ", "ձ", "ջ", "և", "ր", "չ", "ճ", "ժ"},				
				{"ք", "ո", "ե", "ռ", "տ", "ը", "ու", "ի", "օ", "պ"},
				{"ա", "ս", "դ", "ֆ", "գ", "հ", "յ", "կ", "լ", "շ"},
				{"զ", "ղ", "ց", "վ", "բ", "ն", "մ", "խ", "ծ"}
				};		
		
		scoreContainer.setTypeface(typeface);
		questionContainer.setTypeface(typeface);		
		 
		keyboardContainer = (TableLayout) findViewById(R.id.myKeyboard);
		TableRow currentRow;
		Button currentButton;
		for (i=0;i<keyboardContainer.getChildCount();i++)
		{
			currentRow=(TableRow) keyboardContainer.getChildAt(i);
			for (j=0;j<currentRow.getChildCount();j++)
			{				
				currentButton=(Button)(currentRow.getChildAt(j));
				currentButton.setText(keyboardLayout[i][j]);
				currentButton.setTypeface(typeface);
				currentButton.setEnabled(true);
				currentButton.setBackgroundDrawable(getResources().getDrawable(R.drawable.keyboard_button));
				
				currentButton.setOnClickListener(keyboardButtonPress);	
			}
		}
	}
	
	private OnClickListener nextButtonPress = new OnClickListener() {	    
		public void onClick(View v) {
	    	nextWord();
	    }
	};
	
	private OnClickListener skipButtonPress = new OnClickListener() {	    
		public void onClick(View v) {
			if(skipCount>=allowedSkipCount)
				return;
			LinearLayout skipCountContainer=(LinearLayout)findViewById(R.id.skipCountContainer);						
			skipCountContainer.getChildAt(skipCount).setBackgroundResource(R.drawable.arrow_disabled);
			++skipCount;
	    	nextWord();
	    }
	};

	private OnClickListener keyboardButtonPress = new OnClickListener() {
	    @SuppressWarnings("deprecation")
		public void onClick(View v) {
	    	Button currentButton=(Button)(v);
	   // 	tmpTextBox.setText(tmpTextBox.getText()+currentButton.getText().toString());
	    	if(lifeCounter<0 || currentCount<0)
	    		return;
	    	
	    	int i,cnt=0;
	    	Boolean exists=false;
	    	String ans=currentWord.a;
	    	String pressedText=currentButton.getText().toString();
	    	
	    	for(i=0;i<ans.length();++i,++cnt)
	    	{
	    		if(i+1<ans.length() && ans.charAt(i+1)=='ւ')
	    		{
	    			if(pressedText.equals("ու"))
	    			{
	    				((TextView)letterContainer.getChildAt(cnt)).setText(pressedText);
	    				exists=true;
	    				--currentCount;
	    			}
	    			++i;
	    		}
	    		else
	    		{
	    			if(pressedText.equals(""+ans.charAt(i)))
	    			{
	    				((TextView)letterContainer.getChildAt(cnt)).setText(pressedText);
	    				exists=true;
	    				--currentCount;
	    			}
	    		}
	    	}
	    	if(!exists)
	    	{
	    		currentButton.setBackgroundDrawable(getResources().getDrawable(R.drawable.button_invalid));
	    		--lifeCounter;	    		
	    		int[] imageNames=new int[]{R.drawable.sm_0,R.drawable.sm_1,R.drawable.sm_2,R.drawable.sm_3,R.drawable.sm_4,R.drawable.sm_5,R.drawable.sm_6,R.drawable.sm_7,R.drawable.sm_8,R.drawable.sm_9,R.drawable.sm_10,R.drawable.sm_11,R.drawable.sm_12,R.drawable.sm_13,R.drawable.sm_14};
	    		
	    		//Bitmap nextImage=BitmapFactory.decodeResource(getApplicationContext().getResources(),
                 //       imageNames[lifeCounter]);	
	    		
	    		((ImageView)(findViewById(R.id.personContainer))).setImageResource(imageNames[lifeCounter]);
	    		//nextImage.recycle();
	    	//	tmpTextBox.setText(pressedText+" : "+ans.charAt(0));
	    	}
	    	
	    	if(lifeCounter==0)
	    	{
	    		lifeCounter--;
	    		for(cnt=0,i=0;i<ans.length();++i,++cnt)
		    	{
		    		if(i+1<ans.length() && ans.charAt(i+1)=='ւ')
		    		{		    			
		    			((TextView)letterContainer.getChildAt(cnt)).setText("ու");		    		
		    			++i;
		    		}
		    		else		    		
		    			((TextView)letterContainer.getChildAt(cnt)).setText(ans.charAt(i)+"");
		    		((TextView)letterContainer.getChildAt(cnt)).setBackgroundColor(Color.RED);
		    	}
	    		
	    		final Handler wrongHandler = new Handler();
	    		wrongHandler.postDelayed(new Runnable() {
	    		    @Override
	    		    public void run() {
	    		    	Intent myIntent = new Intent(MainActivity.this, YouLostDialog.class);
	    				myIntent.putExtra("score", "" + score); //Optional parameters
	    				myIntent.putExtra("mode", mode);				
	    				MainActivity.this.startActivity(myIntent);
	    				MainActivity.this.finish();
	    		    }
	    		}, 1750);
	    		
	    		
	    		//krvar
	    	}
	    	
	    	currentButton.setEnabled(false);
	    	if(currentCount==0)
	    	{
	    		currentCount--;
	    		++score;
		    	scoreContainer.setText("Հաշիվ: "+score);
		    	
	    		for(cnt=0,i=0;i<ans.length();++i,++cnt)		    	
		    		((TextView)letterContainer.getChildAt(cnt)).setBackgroundColor(Color.parseColor("#2a7907"));
		    	
		    	
		    	final Handler rightHandler = new Handler();
		    	rightHandler.postDelayed(new Runnable() {
	    		    @Override
	    		    public void run() {
	    		    	Log.i("MyActivity", "Handler works normally!!!!");
	    		    	nextWord();
	    		    }
	    		}, 800);
	    		
	    	}
	    	
	    }
	};

	private void nextWord()
	{
		initKeyboard();
		while(!wordFits(questions[++currentQuestionNumber].a)){}		
		
		currentWord=questions[currentQuestionNumber];
		questionContainer.setText(currentWord.q);
		currentCount=currentWord.a.length()-currentWord.a.length()+currentWord.a.replace("ւ", "").length();
		renderLetters(currentCount);
	}
	private boolean wordFits(String word){
		float textWidth = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 40, getResources().getDisplayMetrics());		
		if (displayWidth<(word.length())*(textWidth+10)-10)
			return false;
		return true;
	}
//	@SuppressWarnings("deprecation")
	private void renderLetters(int count)
	{
		int i;
		
		
		
		letterContainer.removeAllViews();		
		
		float textHeight = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 40, getResources().getDisplayMetrics());
		LinearLayout.LayoutParams textViewLayout=new LinearLayout.LayoutParams((int) textHeight, LayoutParams.MATCH_PARENT);
		textViewLayout.setMargins(5, 0, 5, 0);
		
		
		for (i=0;i<count;i++)
		{
			TextView currentText= new TextView(this);
			currentText.setText("");
			currentText.setBackgroundResource(R.drawable.letter_shape);
			currentText.setGravity(Gravity.CENTER);
			currentText.setLayoutParams(textViewLayout);
			currentText.setTextColor(Color.WHITE);
			currentText.setTypeface(typeface);
			letterContainer.addView(currentText);
		}
	}
	
	@Override
	public boolean onCreateOptionsMenu(Menu menu) {
		// Inflate the menu; this adds items to the action bar if it is present.
		getMenuInflater().inflate(R.menu.main, menu);
		return true;
	}

}
