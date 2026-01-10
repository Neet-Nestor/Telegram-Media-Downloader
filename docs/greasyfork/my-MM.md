# Telegram Media Downloader

**Telegram ကို အပြည့်အဝ ဖွင့်လှစ်အသုံးချလိုက်ပါ: ကြိုက်သမျှ ဒေါင်းလုဒ်လုပ်နိုင်ပါပြီ။**

ဒီ script က Telegram Webapp တွေထဲက ဒေါင်းလုပ် ပိတ်ထားတာ၊ ဒါမှမဟုတ် ကန့်သတ်ထားတဲ့ Chats, Stories နဲ့ Private ချန်နယ်တွေအထိပါ ဓာတ်ပုံ၊ GIF နဲ့ ဗီဒီယိုတွေကို ဒေါင်းလုပ် လုပ်လို့ရအောင် Unlock လုပ်ပေးနိုင်ပါတယ်။

အရေးကြီးအချက်: ဒီ script ကို **အခမဲ့** အသုံးပြုလို့ ရပါတယ်။ ဒေါင်းလုပ်ဆွဲဖို့အတွက် ပိုက်ဆံကောက်ခံနေတာမျိုးတွေ့ရင် မပေးဖို့နှင့် [GitHub issues](https://github.com/Neet-Nestor/Telegram-Media-Downloader/issues) ကို report တင်တာ၊ ဒါမှမဟုတ် ကောမန့်ကနေပြီး‌တော့မှ developer ကိုအသိပေးလို့ရပါတယ်။


## Install လုပ်နည်း

Userscript extension တစ်ခုကို install လုပ်ပြီး အပေါ်က "install" ခလုပ်ကိုနှိပ်ကာ script ကို install လုပ်ပါ။

**အရေးကြီးအချက်:** Chrome-အ‌ခြေခံ browser ထဲမှာ Tampermonkey extension ကိုအသုံးပြုနေရင် ဒီထဲက [လမ်းညွန်ချက်အတိုင်း](https://www.tampermonkey.net/faq.php#Q209) Developer Mode ကိုဖွင့်ပေးရပါမယ်။


## အသုံးပြုနည်း
ဒီ script က Telegram Webapp မှာသာ အလုပ်လုပ်ပါတယ်။ ဓာတ်ပုံ၊ GIF နဲ့ ဗီဒီယိုတွေအတွက် ဒေါင်းလုပ်‌‌ခလုတ်ကို အလိုအလျောက် ထည့်ပေးပါလိမ့်မယ်။

![ဓာတ်ပုံ ဒေါင်းလုပ်](https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExY2VjNmU2ZDM0YTFlOWY4YTMzZDZmNjVlMDE2ODQ4OGY4N2E3MDFkNSZlcD12MV9pbnRlcm5hbF9naWZzX2dpZklkJmN0PWc/lqCVcw0pCd2VA3zqoE/giphy.gif)
![GIF ဒေါင်းလုပ်](https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExMzYwMzM3ZTMzYmI1MzA4M2EyYmY0NTFlOTg4OWFhNjhjNDk5YTkzYiZlcD12MV9pbnRlcm5hbF9naWZzX2dpZklkJmN0PWc/wnYzW4vwpPdeuo62nQ/giphy.gif)
![ဗီဒီယို ဒေါင်းလုပ်](https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExMXcxYnJxaXMxcW05YW5rZ2YzZzE0bTU4aTBwYXI1N3pmdnVzbDFrdSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/EEPbblwmSpteAmwLls/giphy.gif)
![Story ဒေါင်းလုပ်](https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3Z5Y2VzM2QzbW1xc3ZwNTQ2N3Q0a3lnanpxdW55c2Qzajl5NXZsaCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/xJFjBGi8isHPR5cuHl/giphy.gif)

ဗီဒီယိုဒေါင်းလုပ် လုပ်တဲ့အခါ ဒေါင်းလုပ် စတင်ပြီးနောက် screen ရဲ့ အောက်ညာဘက်ထောင့်မှာ Progress Bar ပေါ်လာပါလိမ့်မယ်။ ဓာတ်ပုံ နဲ့ အသံဒေါင်းလုပ်တွေ အတွက်တော့ Progress Bar ပေါ်မှာမဟုတ်ပါဘူး။

### Support လုပ်ထားသော Webapp ဗားရှင်းများ
Telegram Webapp မှာ ဗားရှင်း (၂) မျိုး ရှိပါတယ်:
- https://webk.telegram.org / https://web.telegram.org/k/ (**သုံးရန်အကြံပြု**)
- https://webz.telegram.org / https://web.telegram.org/a/

ဒီ script က ဗားရှင်းနှစ်မျိုးလုံးမှာ အလုပ်လုပ်နိုင်ပေမယ့် Feature တချို့ (ဥပမာ — အသံမက်ဆေ့ချ် ဒေါင်းလုဒ်) က /k/ ဗားရှင်းမှာပဲ ရပါတယ်။ တချို့ Feature တွေ အလုပ်မလုပ်ဘူးဆိုရင် /k/ ဗားရှင်းကို ပြောင်းသုံးဖို့ အကြံပြုပါတယ်။

### ဒေါင်းလုပ် Progress စစ်ဆေးနည်း
ဗီဒီယိုတွေအတွက် screen အောက်ညာဘက်မှာ Progress Bar ကို တွေ့ရပါလိမ့်မယ်။ Log တွေကို [DevTools console](https://developer.chrome.com/docs/devtools/open/) မှာလည်း စစ်ဆေးနိုင်ပါတယ်။

## Author ကို Support လုပ်လိုပါက
ဒီ script ကို ကြိုက်နှစ်သက်တယ်ဆိုရင် [Venmo](https://venmo.com/u/NeetNestor)၊ ဒါမှမဟုတ် [buy me a coffee](https://ko-fi.com/neetnestor) ကနေ support လုပ်နိုင်ပါတယ်။ :)

## ဆက်သွယ်ရန်
ဒီ script ကို အသုံးပြုရာမှာ ပြဿနာတစ်ခုခု ကြုံတွေ့ရင် [GitHub page](https://github.com/Neet-Nestor/Telegram-Media-Downloader) ကို ဝင်ပြီး Issue တစ်ခု ဖွင့်ကာ ဆက်သွယ်နိုင်ပါတယ်။