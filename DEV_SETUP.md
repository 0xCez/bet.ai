# 🚀 Developer Setup Guide

Welcome to Bet.AI! This branch (`dev-onboarding`) is your safe development environment.

## ✅ Quick Start

### 1. Setup Firebase Config
```bash
# Copy the example Firebase config
cp firebaseConfig.example.js firebaseConfig.js
```

### 2. Install Dependencies
```bash
npm install
cd ios && pod install && cd ..
```

### 3. Run the App
```bash
npm start
# Then press 'i' for iOS or 'a' for Android
```

That's it! You're ready to code! 🎉

---

## 📝 What You Need to Know

### Firebase Setup (Already Done!)
- ✅ This branch uses **betai-dev-16** (development Firebase project)
- ✅ Separate from production - safe to test everything
- ✅ Empty database - create test accounts as needed

### Cloud Functions
- All external API keys (Odds API, OpenAI, etc.) are **already configured**
- Functions are deployed to dev Firebase
- You can test all features without affecting production

### RevenueCat
- Same RevenueCat keys as production (safe to use)
- Test subscriptions using Apple/Google test accounts

---

## 🧪 Testing & Development

### Create Test Accounts
- Sign up with any email (e.g., `test@example.com`)
- No real user data - this is a clean dev environment

### Making Changes
1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Test thoroughly
4. Push: `git push origin feature/your-feature`
5. Create a Pull Request to `dev-onboarding` (NOT main!)

---

## ⚠️ Important Rules

- ❌ **NEVER** push to `main` branch
- ❌ **NEVER** merge to `main` without approval
- ✅ Always work on feature branches
- ✅ Create PRs to `dev-onboarding` for review
- ✅ Ask questions if unsure!

---

## 🆘 Need Help?

- Check the main README.md for app architecture
- Ask your team lead for access or credentials
- Review existing code for patterns and conventions

---

**Happy coding! 🚀**
