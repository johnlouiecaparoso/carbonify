# Carbonify testing guide

This guide is for people helping test Carbonify. You do not need to know anything about
programming. If you can use a website, you can do this.

Read this once before you start. It takes about five minutes.

---

## What Carbonify is

Carbonify is a website where people buy and sell carbon credits. A carbon credit is proof that
someone removed or avoided one tonne of carbon dioxide. Companies buy them to offset their own
emissions.

There are different kinds of user. A buyer buys credits. A project developer creates projects and
sells the credits from them. A verifier checks that projects are real before credits can be sold.
A farmer sells crop waste as fuel. An admin runs the platform.

You will be told which one you are.

---

## The most important thing to know

No real money moves. Nothing you do can cost anyone anything. The payment system is in test mode,
which means it pretends to take payments. Please buy things freely and do not worry about amounts.

Use this card number whenever you are asked to pay by card:

    4343 4343 4343 4345

Any expiry date in the future works. Any three digit security code works.

Never use your own real card. It will not work and it is not needed.

---

## What we actually want from you

We are not really testing whether you can find the buttons. We are testing whether the website ever
tells you something that is not true.

The single most useful thing you can tell us is this. If a screen ever says you have nothing, and
you know that is wrong, write it down straight away. For example:

- It says you own no credits, but you just bought some.
- It says you have no orders, but you placed one a minute ago.
- It shows an empty list where you expected to see something.
- A total says zero when you know it should not.

This kind of problem is the hardest for us to find on our own, because the website does not show an
error. It just quietly shows you nothing, and that looks completely normal.

The second most useful thing is a number that disagrees with itself. If a price says 500 on one
screen and 450 on the next, tell us both numbers and both screens.

You do not need to work out why something happened. Just tell us what you saw.

---

## Ground rules

1. Use the website at this address: https://carbonify-gilt.vercel.app
2. Use the account you were given. Do not share it with another tester.
3. Do not sign in as two different people in the same browser at the same time. Use a second browser
   or a private window if you need to.
4. If something looks wrong, do not refresh the page. Tell us first. Once you refresh, the evidence
   is often gone.
5. Take a screenshot of the whole window, not just a small part. The parts around the edge are often
   what tell us where the problem is.
6. Write things down as you go, not at the end. You will forget.

---

## Part one, the money test

This is the most important test and it needs several people working together. Do not start it on
your own. The person running the session will tell you when to go.

Find your role below and follow only your part.

### If you are the buyer

Your job is to buy things. Someone else is watching what happens to the money.

1. Sign in and go to the page called Marketplace.
2. Buy one credit using the card number above. Write down the exact amount you paid.
3. Buy a second credit using the card again. Write down that amount too.
4. Tell the seller you have done both.
5. Wait to be asked, then buy a third credit, but this time choose GCash on the payment page.
   Do not use wallet balance. GCash and wallet balance are different things and we need GCash.
6. Tell the seller again.

After each purchase, check that the credits actually appear in your account. If they do not, that is
exactly the kind of thing we need to know.

### If you are the seller

Your job is to watch what happens to your money after someone buys from you. You will be asked to
look at the same screen several times.

The screen you need is called Seller Earnings. It shows two numbers:

- Held in escrow. Money that is yours but that you cannot take out yet.
- Available to withdraw. Money you can take out now.

Every single time you look at that screen, write down both numbers. Even when only one of them seems
to have changed. Half of what we are testing is that the other number stays still.

1. Wait until you are told the first two purchases happened. Open Seller Earnings. Write down both
   numbers. The money from card purchases should show as held. That is correct and not a fault.
2. Wait until you are told the GCash purchase happened. Look again. Write down both numbers. This
   one should be available straight away, with nothing held.
3. Later you will be asked to wait about fifteen minutes and look again. One of the held amounts
   should have moved across to available.
4. Later still, after the person running the session refunds a purchase, look one more time. The
   held amount should disappear. Your available money must not change. This step is the most
   important one in the whole test. Write down both numbers carefully.
5. Finally you will be asked to submit something called KYB, which is business verification. After
   it is approved, request a payout.

If a number ever looks wrong to you, say so immediately and leave the screen exactly as it is.

---

## Part two, the role tests

Do these after the money test, or on another day. They are slower and calmer. Take your time.

Only do the section for the role you were given.

### Buyer

1. Look at the marketplace. Try the search and the filters.
2. Open a project and read its details. Does anything look wrong or missing?
3. Add something to your basket, then remove it. Does the basket update correctly?
4. Buy something. Then check that it appears in your portfolio.
5. Retire a credit. Retiring means using it up so it cannot be sold again. Check that you get a
   certificate afterwards.
6. Download the certificate. Does the file actually download and open?
7. Look at your receipts and orders. Do the amounts match what you paid?

### Project developer

1. Create a new project. Fill in everything it asks for.
2. Save it as a draft, leave the page, and come back. Is your draft still there and correct?
3. Submit the project for review.
4. Upload a document to the project.
5. Look at your projects list. Does the status make sense to you?
6. Look at the earnings or ledger page. Do the numbers match what you expect?

### Verifier

1. Open the review queue. Can you see projects waiting for you?
2. Open one and read everything. Is there enough information to make a decision?
3. Leave a comment asking the developer for more information.
4. Check whether you can see who wrote each comment. Names should be shown, not a blank or the word
   User.
5. Approve or reject one project. Was it clear what would happen before you clicked?
6. Look for a record of the decisions you have made. Can you find it?

### Farmer

1. List some crop waste for sale.
2. Look at requests for quotes from buyers.
3. Confirm a delivery.
4. When a buyer marks something as paid, check that you are asked to confirm it. You should be able
   to disagree if you were not actually paid.
5. Try disagreeing with a payment and see what happens.

### LGU or local government user

1. Look at the dashboard for your area.
2. Check the waste and emissions figures. Do they look sensible for your area?
3. Look at any projects in your jurisdiction.
4. Try exporting or downloading a report.

---

## Part three, quick checks anyone can do

These take about ten minutes each and anyone can do them.

### Using only the keyboard

Some people cannot use a mouse. Put your mouse aside completely.

1. Use the Tab key to move between things and Enter to activate them.
2. Can you sign in without touching the mouse?
3. Can you always see where you are on the page? There should be a visible outline on whatever is
   selected.
4. Open a pop up window and try to close it with the Escape key.
5. Can you reach the account menu at the top right and sign out?

Tell us anywhere you got stuck or could not see where you were.

### On a phone

1. Open the site on your phone.
2. Go through several pages. Does anything run off the side of the screen?
3. Do you ever have to scroll sideways to read something?
4. Are buttons big enough to tap without zooming?
5. Try filling in a form. Does the keyboard cover what you are typing?

### Without signing in

1. Open the site in a private or incognito window.
2. Look at the home page, the marketplace, the registry and the about page.
3. Try the certificate verification page.
4. Does anything look broken, empty, or ask you to sign in when it should not?

---

## When you are finished

Fill in the feedback form. It is a separate document called TESTER_FEEDBACK.

Please fill it in even if everything worked and you found nothing. Knowing that someone went through
a whole area and found nothing wrong is genuinely useful information, and we cannot tell the
difference between that and nobody having looked.

Thank you. Finding a problem now, before real people are using this, is the whole point.
