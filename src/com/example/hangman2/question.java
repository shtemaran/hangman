package com.example.hangman2;

public class question {
	String q,a;
	Boolean used;
	
	question(String c,String b)
	{
		q=c;
		a=b;
		used=false;
	}
	question()
	{
		a="";
		q="";
		used=false;
	}
};

