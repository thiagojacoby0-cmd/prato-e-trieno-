package br.com.pratotreino.app;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.View;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        int bgColor = Color.parseColor("#061314");
        getWindow().setBackgroundDrawable(new ColorDrawable(bgColor));
        getWindow().setStatusBarColor(bgColor);
        getWindow().setNavigationBarColor(Color.parseColor("#081719"));

        View decorView = getWindow().getDecorView();
        decorView.setBackgroundColor(bgColor);

        View content = findViewById(android.R.id.content);
        if (content != null) {
            content.setBackgroundColor(bgColor);
        }

        WindowInsetsControllerCompat controller =
            new WindowInsetsControllerCompat(getWindow(), decorView);
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
    }
}
