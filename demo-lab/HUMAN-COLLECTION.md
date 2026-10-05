# Life and data collection

Twenty working local prototypes alongside the 27 existing automation demos. These are bounded interactive tools, not twenty deployed full-stack products. Defaults are invented examples; no real user study, live dataset, model call or external integration is claimed. Browser input is not saved or transmitted.

## Inspiration and source boundaries

- [Our World in Data time use](https://ourworldindata.org/time-use): time allocation as a way to understand everyday life; no dataset copied.
- [Gapminder Tools](https://www.gapminder.org/tools/): accessible exploration of data; no code or datasets copied.
- [AccessNow](https://accessnow.com/about/): accessibility information shaped by lived experience; our sample flags are not verified venue data.
- [Be My Eyes](https://www.bemyeyes.com/about-us/): human connection as a product purpose; no assistive service integration.
- [Olio](https://olioapp.com/en/getting-started-on-olio/what-is-olio/): sharing and reducing waste; our reminders are not food-safety assessments.
- [Europeana](https://www.europeana.eu/en/stories): personal and cultural stories; our memory-permission example has no external archive connection.

## Existing products

PORT / OS: current local documentation describes an owner-only prototype that prepares and routes decisions for human review. The collection opens the existing public IMP-01 engineering demonstration. Private source and operating data are not copied into the showcase.

PaceAtlas AI: confirmed by Gabriel as the trip app. Its repository was not found in the 19 accessible Frosty9810 repositories. Original source review and demo integration remain pending an exact repository URL. TRIP-01 through TRIP-03 are newly built independent prototypes, not claimed PaceAtlas features.

## Project catalogue

### LIFE-01 Room for Life

**For:** Everyday life. **Purpose:** Make room in a day without grading yourself.

Sleep, work, care and travel can consume more time than a calendar makes visible.

**Try:** Sleep, work, care, travel hours = [8,8,3,1].

**Example result:** 4 hours remain unallocated. Leave room for rest and the unexpected.

**Inspect:** [input and output](human-examples/LIFE-01.json). The result includes chart rows, units and calculation details.

### LIFE-02 Shared Table

**For:** Everyday life. **Purpose:** Split a meal fairly, down to the last cent.

Friends can inspect an exact equal split before deciding how they want to pay.

**Try:** Total in cents = 1001; People sharing = 3.

**Example result:** An exact split, with leftover cents distributed one at a time.

**Inspect:** [input and output](human-examples/LIFE-02.json). The result includes chart rows, units and calculation details.

### LIFE-03 Pantry First

**For:** Everyday life. **Purpose:** A gentle reminder of what to plan around next.

Keep reminder dates visible without presenting them as food-safety decisions.

**Try:** Days until item reminders = [1,5,2,8]; Soon window in days = 2.

**Example result:** Plan around the items with the nearest reminder dates. Dates alone do not establish food safety.

**Inspect:** [input and output](human-examples/LIFE-03.json). The result includes chart rows, units and calculation details.

### TRIP-01 Gentle Day

**For:** Travel and belonging. **Purpose:** Leave room to breathe between places.

A day out should include rest, not just a list of attractions.

**Try:** Walking segments in minutes = [25,40,20]; Rest minutes per stop = 20; Available day minutes = 180.

**Example result:** This sample day leaves breathing room.

**Inspect:** [input and output](human-examples/TRIP-01.json). The result includes chart rows, units and calculation details.

### TRIP-02 Pack Light

**For:** Travel and belonging. **Purpose:** Know what your bag carries before you do.

Compare entered item weights against your own bag limit.

**Try:** Item weights in kg = [2,1.5,0.8,3]; Chosen bag limit in kg = 8.

**Example result:** 7.3 kg packed. Within your entered limit.

**Inspect:** [input and output](human-examples/TRIP-02.json). The result includes chart rows, units and calculation details.

### TRIP-03 Your Way There

**For:** Travel and belonging. **Purpose:** A route comparison that listens to your preferences.

Minutes alone can hide stairs and other effort; choose your own tradeoff.

**Try:** Route times in minutes = [15,22,30]; Stair segments by route = [3,0,1]; Added points per stair segment = 5.

**Example result:** Route 2 has the lowest score under your preferences. Verify real accessibility separately.

**Inspect:** [input and output](human-examples/TRIP-03.json). The result includes chart rows, units and calculation details.

### LIFE-04 Together Time

**For:** Everyday life. **Purpose:** Find a moment that works for everyone.

Compare voluntary availability in the same local day and timezone.

**Try:** Start hours for each person = [9,11,10]; End hours for each person = [14,15,13].

**Example result:** Shared time from 11:00 to 13:00.

**Inspect:** [input and output](human-examples/LIFE-04.json). The result includes chart rows, units and calculation details.

### LIFE-05 Book Nest

**For:** Everyday life. **Purpose:** A reading plan with no guilt attached.

Use a chosen reading pace to make a long book feel manageable.

**Try:** Pages remaining = 240; Pages per reading day = 15.

**Example result:** At this chosen pace, plan for 16 reading days. No streak required.

**Inspect:** [input and output](human-examples/LIFE-05.json). The result includes chart rows, units and calculation details.

### LIFE-06 Little Lessons

**For:** Everyday life. **Purpose:** Make learning visible in small pieces.

Short learning sessions count too; the goal belongs to the learner.

**Try:** Session minutes = [10,20,15]; Chosen weekly minutes = 90.

**Example result:** 50% of your chosen learning time. Adjust the goal to your life.

**Inspect:** [input and output](human-examples/LIFE-06.json). The result includes chart rows, units and calculation details.

### CARE-01 Care Circle

**For:** Community care. **Purpose:** Ask for help without overloading one person.

Suggest the least-loaded willing helper below an entered limit; never assign automatically.

**Try:** Current tasks per helper = [2,0,1]; Voluntary task limit = 3.

**Example result:** Ask helper 2 first, then confirm consent.

**Inspect:** [input and output](human-examples/CARE-01.json). The result includes chart rows, units and calculation details.

### CARE-02 Neighbour Hours

**For:** Community care. **Purpose:** See the gap before asking people for more.

Match offered volunteer time against a community activity’s needs.

**Try:** Hours offered by volunteers = [2,1,3]; Hours the activity needs = 8.

**Example result:** There is a time gap; ask before adding work.

**Inspect:** [input and output](human-examples/CARE-02.json). The result includes chart rows, units and calculation details.

### LIFE-07 Second Life

**For:** Everyday life. **Purpose:** Give a repair decision some context.

Compare quotes and your estimated added useful life without assuming the cheaper choice is always better.

**Try:** Repair quote in cost units = 40; Replacement quote = 120; Estimated added months = 12.

**Example result:** Compare the entered quotes and your own expected useful life. This does not assess safety or repairability.

**Inspect:** [input and output](human-examples/LIFE-07.json). The result includes chart rows, units and calculation details.

### DATA-01 Water Notes

**For:** Data stories. **Purpose:** A small data story about everyday resource use.

Compare a sample of weekly readings with a user-entered baseline.

**Try:** Weekly usage in litres = [500,460,480,440]; Comparison litres = 500.

**Example result:** Observed sample average: 470 litres. 6% below your entered comparison.

**Inspect:** [input and output](human-examples/DATA-01.json). The result includes chart rows, units and calculation details.

### DATA-02 Energy Diary

**For:** Data stories. **Purpose:** Understand usage before trying to change it.

Separate usage-based cost from fixed charges using transparent arithmetic.

**Try:** Daily usage in kWh = [3,4,2,5]; Cost units per kWh = 0.2.

**Example result:** The entered usage costs 2.8 cost units before fixed charges.

**Inspect:** [input and output](human-examples/DATA-02.json). The result includes chart rows, units and calculation details.

### CARE-03 Story Keep

**For:** Community care. **Purpose:** Memories deserve permission, not automatic sharing.

Count explicit permissions before assembling a proposed memory collection.

**Try:** Permission per memory: 1 yes, 0 no = [1,0,1,0].

**Example result:** Only explicitly permitted memories are included in this proposed collection. Nothing is uploaded.

**Inspect:** [input and output](human-examples/CARE-03.json). The result includes chart rows, units and calculation details.

### CARE-04 Access Notes

**For:** Community care. **Purpose:** Make uncertainty visible before a visit.

Separate unknown information from reported accessibility observations.

**Try:** Observations: 0 unknown, 1 available, 2 unavailable = [1,0,2,1,0].

**Example result:** Unknown access information stays unknown. Confirm current details with the place before a visit.

**Inspect:** [input and output](human-examples/CARE-04.json). The result includes chart rows, units and calculation details.

### DATA-03 Time Lens

**For:** Data stories. **Purpose:** Let the median tell its side of the story.

Explore how an unusually long day changes an average.

**Try:** Daily minutes = [20,25,20,30,150].

**Example result:** Mean 49, median 25 minutes. Compare both when one large day changes the picture.

**Inspect:** [input and output](human-examples/DATA-03.json). The result includes chart rows, units and calculation details.

### DATA-04 Every Voice

**For:** Data stories. **Purpose:** Missing answers are not zero satisfaction.

Explore a survey distribution while keeping nonresponse visible.

**Try:** Ratings 1–5; 0 means unanswered = [4,5,0,3,4,0].

**Example result:** 4 of 6 answered. Missing responses are excluded from the average.

**Inspect:** [input and output](human-examples/DATA-04.json). The result includes chart rows, units and calculation details.

### DATA-05 Small Steps

**For:** Data stories. **Purpose:** A pattern to notice, not a score to chase.

Compare two parts of an activity sample without causal or health claims.

**Try:** Activity observations in minutes = [10,0,20,15,25,10].

**Example result:** A descriptive comparison of two parts of your sample. A quiet day is not a failure, and this does not explain causes.

**Inspect:** [input and output](human-examples/DATA-05.json). The result includes chart rows, units and calculation details.

### DATA-06 Near Enough

**For:** Data stories. **Purpose:** Who spends longer reaching everyday places?

Compare two small journey-time samples without hiding their limitations.

**Try:** Area A journey minutes = [10,12,15]; Area B journey minutes = [20,25,30,40].

**Example result:** Compare reported journey times, while keeping sample size and selection bias visible.

**Inspect:** [input and output](human-examples/DATA-06.json). The result includes chart rows, units and calculation details.

## Validation and growth

The test suite independently asserts each project’s expected example result, checks malformed inputs, and exercises all twenty interfaces, reset/error handling and category filtering. Extra checks cover all-missing survey responses, unassigned care tasks, mismatched route arrays and integer-cent splits. Browser rendering and user usability studies remain separate.

Next product-depth work should follow user feedback: allow richer named records, test keyboard and assistive-technology use in a real browser, add explicit import/export schemas, and connect original PaceAtlas source when identified. Do not turn personal data into a leaderboard or infer wellbeing from activity totals.
