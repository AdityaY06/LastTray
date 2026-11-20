# LastTray deployment checklist

- [ ] Extract the ZIP.
- [ ] Confirm `index.html`, `main.js`, `style.css`, `config.js` sit side by side.
- [ ] Commit the folder contents (not a parent folder containing another project folder) to GitHub.
- [ ] Vercel Framework Preset = Other.
- [ ] Vercel Root Directory = `.`.
- [ ] Build Command is blank.
- [ ] Output Directory = `.`.
- [ ] Deploy.
- [ ] Open `/main.js` on the deployed domain; confirm it returns JavaScript, not 404.
- [ ] Open `/style.css` on the deployed domain; confirm it returns CSS, not 404.
- [ ] Open the root domain and test browsing, filters, reservation, seller listing and collected status.
- [ ] Before real users, configure Supabase and test with separate browsers/devices.
