package com.example.hangman2;

import android.content.SharedPreferences;

public class scoreKeeper {
	
	static int updateHighscore(int score, SharedPreferences sharedPref, String str)
	{
		int highscore=sharedPref.getInt(str, -1);
		if(score>highscore)
		{
			SharedPreferences.Editor editor = sharedPref.edit();
			editor.putInt(str, score);
			editor.commit();
			return 1;
		}
		return 0;
	}
	
};


















