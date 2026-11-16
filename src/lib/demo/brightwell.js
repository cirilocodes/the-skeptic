// Brightwell Learning: a fictional online learning platform that runs courses for partner universities.
// Plans are Epics, incidents are Bugs, decisions and retros live in Confluence. All names are invented.
import { epic } from './builders.js';

export const company = { id: 'brightwell', name: 'Brightwell Learning', project: 'BL', planType: 'Epic', incidentType: 'Bug', confluence: true };

export const epics = [
  // ---- 2021 ------------------------------------------------------------------
  epic('Course catalogue for partner universities', 'shipped', 'February 2021', 'Yaa Frimpong', 'Each partner university lists its online courses in one catalogue.', ['Catalogue pages per university', 'Course search and filters', 'Enrolment button']),
  epic('Video lectures with captions', 'shipped', 'May 2021', 'Samuel Ofori', 'Recorded lectures with English captions.', ['Caption vendor contract', 'Video upload for lecturers', 'Caption editor']),
  epic('Assignment upload and grading', 'shipped', 'September 2021', 'Grace Nyarko', 'Students upload assignments; lecturers grade them with a rubric.', ['Upload with deadline', 'Rubric builder', 'Grade release to students']),
  // ---- 2022 ------------------------------------------------------------------
  epic('Student mobile app', 'shipped', 'January 2022', 'Samuel Ofori', 'An Android app for lectures, assignments and grades.', ['Lecture list and player', 'Assignment screens', 'Grades screen']),
  epic('Low-bandwidth video mode', 'shipped', 'April 2022', 'Samuel Ofori', 'Lectures at a lower quality for students on slow connections.', ['Audio-only option', '240p video renditions', 'Data use estimate per lecture']),
  epic('Discussion forums per course', 'shipped', 'June 2022', 'Grace Nyarko', 'A forum for each course, moderated by teaching assistants.', ['Forum threads', 'Moderation tools for teaching assistants']),
  epic('Online tuition payments', 'shipped', 'August 2022', 'Kwesi Arthur', 'Students pay fees by card or mobile money at registration.', ['Payment gateway integration', 'Receipts by email', 'Instalment plans for fees', 'Refund process for withdrawn students']),
  epic('Assignment deadline reminders by SMS', 'shipped', 'November 2022', 'Kwesi Arthur', 'An SMS the day before an assignment is due.', ['SMS gateway contract', 'Reminder schedule per course', 'Reminder opt-out for students']),
  // ---- 2023 ------------------------------------------------------------------
  epic(
    'AI webcam proctoring for remote exams',
    'abandoned',
    'June 2023',
    'Grace Nyarko',
    'Goal: watch students through their webcam during online exams and flag cheating automatically. Piloted with two partner universities.',
    ['Proctoring vendor evaluation', 'Webcam check before the exam', 'Review queue for flagged students'],
    {
      why: 'students on weak connections were flagged as cheating when their video froze, universities received formal complaints, and the data protection review of the recordings was never finished.',
      comment: 'Stopping proctoring after the mid-semester pilot. Too many false flags and we cannot say how long we may keep the recordings.',
    },
  ),
  epic('Exam results by SMS', 'shipped', 'March 2023', 'Kwesi Arthur', 'Students get their results by SMS on release day.', ['Result message template', 'Opt-out for results messages', 'Results message for resit students']),
  epic('Plagiarism checker integration', 'shipped', 'May 2023', 'Grace Nyarko', 'Assignments are checked against published work and earlier submissions.', ['Checker vendor connection', 'Similarity report for lecturers', 'Appeal process for similarity reports']),
  epic('Lecturer analytics dashboard', 'shipped', 'September 2023', 'Yaa Frimpong', 'Lecturers see who watched which lecture and who is falling behind.', ['Watch-time per student', 'At-risk student list', 'Weekly digest for course leads']),
  // ---- 2024 ------------------------------------------------------------------
  epic('Virtual science labs', 'abandoned', 'February 2024', 'Samuel Ofori', 'Simulated chemistry and physics labs in the browser.', ['Lab simulation vendor trial', 'Two pilot experiments'], { why: 'the simulations needed laptops that most students did not have, and phones could not run them.' }),
  epic('Lecture video player with speed controls', 'shipped', 'April 2024', 'Samuel Ofori', 'Play lectures at 0.75x to 2x, with skip forward and back.', ['Playback speed menu', 'Skip 10 seconds buttons', 'Remember last position']),
  epic('Group projects workspace', 'shipped', 'June 2024', 'Grace Nyarko', 'Shared space for group assignments with files and a task list.', ['Group creation by lecturers', 'Shared files', 'Peer evaluation form']),
  epic('Certificates with QR verification', 'shipped', 'August 2024', 'Yaa Frimpong', 'Completion certificates employers can verify by scanning a code.', ['Certificate design', 'Verification page', 'Employer verification guide']),
  epic('Download lectures to watch later', 'shipped', 'October 2024', 'Samuel Ofori', 'Students save lectures on their phone to watch without data.', ['Download manager', 'Storage limit warning', 'Delete downloads after the semester']),
  // ---- 2025 ------------------------------------------------------------------
  epic('Peer tutoring marketplace', 'abandoned', 'March 2025', 'Kwesi Arthur', 'Senior students tutor juniors for a fee, booked in the app.', ['Tutor profiles', 'Booking and payment'], { why: 'tutors stopped turning up after the first weeks and payment disputes took more support time than the fees brought in.' }),
  epic('Live lecture streaming', 'shipped', 'May 2025', 'Samuel Ofori', 'Lecturers stream live; the recording is saved automatically.', ['Streaming service setup', 'Live chat moderation for lectures', 'Automatic recording']),
  epic('Accessibility review of the platform', 'shipped', 'July 2025', 'Yaa Frimpong', 'Screen reader and keyboard support across the student pages.', ['Audit by an accessibility consultant', 'Fixes for the top 40 issues']),
  epic('Attendance tracking in live lectures', 'shipped', 'September 2025', 'Grace Nyarko', 'Attendance is recorded when students join a live lecture.', ['Attendance export for lecturers', 'Attendance rules for late joiners']),
  epic('Course reviews by students', 'shipped', 'November 2025', 'Yaa Frimpong', 'Students rate a course at the end of the semester.', ['Review form', 'Review summary for course leads', 'Anonymous review option']),
  // ---- 2026 ------------------------------------------------------------------
  epic('Adaptive practice quizzes', 'in-progress', 'January 2026', 'Grace Nyarko', 'Quizzes that pick harder or easier questions from earlier answers.', ['Question bank tagging', 'Difficulty model']),
  epic('Lecturer office hours booking', 'in-progress', 'March 2026', 'Yaa Frimpong', 'Students book a 15-minute slot with a lecturer.', ['Slot calendar', 'Reminder email before the slot']),
  epic('Short courses for alumni', 'todo', 'April 2026', 'Yaa Frimpong', 'Paid short courses for graduates of partner universities.', ['Alumni pricing']),
  epic('French-language courses', 'todo', 'May 2026', 'Samuel Ofori', 'Courses for partner universities in Côte d’Ivoire and Togo.', ['French caption vendor']),
];

// The plans the demo reviews. Created last, left in To Do. `expect` is what a judge should see.
export const plans = [
  {
    key: 'proctoring',
    summary: 'Webcam proctoring for online exams',
    text: ['Universities want to run final exams online. Watch each student through their webcam during the exam and flag suspected cheating for review.', 'Proposed by: partnerships team. Target: Q2 2027.'],
    dueDate: '2027-05-15',
    expect: 'several',
    sources: ['AI webcam proctoring for remote exams', 'Proctoring flagged 400 students as cheating by mistake', 'Webcam recordings: data protection review never finished', 'Remote proctoring pilot: retro', 'DEC-22: No webcam proctoring; use open-book assessments'],
  },
  {
    key: 'reminders',
    summary: 'SMS reminders before every live lecture',
    text: ['Send each student an SMS reminder 30 minutes before every live lecture they are enrolled in, from the SMS gateway we already use.', 'Proposed by: student success team. Target: Q1 2027.'],
    dueDate: '2027-03-15',
    expect: 'one',
    sources: ['SMS reminders sent to 9,000 students at 3 am'],
  },
  {
    key: 'bookmarks',
    summary: 'Bookmarks inside lecture videos',
    text: ['Let students bookmark a moment in a lecture video and jump back to it when revising.', 'Proposed by: student experience team. Target: Q1 2027.'],
    dueDate: '2027-02-28',
    expect: 'none',
  },
];

export const incidents = [
  {
    summary: 'Proctoring flagged 400 students as cheating by mistake',
    text: ['During the mid-semester proctoring pilot in May 2023, the webcam proctoring tool flagged 400 students as possible cheats, most of them because their video froze on a weak connection.', 'Resolved by cancelling the flags and switching proctoring off on 30 June 2023.'],
  },
  {
    summary: 'SMS reminders sent to 9,000 students at 3 am',
    text: ['On 4 March 2024 a time zone setting in the reminder schedule sent 9,000 SMS reminders at 3 am. Students complained to their universities and two partners asked us to stop messaging their students.', 'Fixed by sending reminders only between 7 am and 9 pm local time, after the partners agreed.'],
  },
  { summary: 'Streaming provider outage during mid-semester week', text: ['On 17 October 2025 students could not watch any recordings for four hours during mid-semester week because our streaming provider was down.', 'Resolved by failing over to the second provider.'] },
  { summary: 'Grades released before moderation', text: ['On 12 December 2024 grades for one course were released before the external examiner had moderated them, and 60 grades later changed.', 'Fixed by a moderation step before release.'] },
  { summary: 'Payment gateway timed out on registration day', text: ['On 5 September 2022 the payment gateway timed out for most of registration day and students could not pay fees.', 'Resolved by extending the registration deadline and adding a second gateway.'] },
];

export const risks = [
  { summary: 'Webcam recordings: data protection review never finished', text: ['Raised April 2023 during the proctoring pilot: webcam recordings of students are personal data. How long may we keep them, and who may watch them? The review was never finished.'] },
  { summary: 'Caption vendor contract ends August 2027', text: ['Our only caption vendor’s contract ends in August 2027 and renewal terms are not agreed.'] },
  { summary: 'Lecturers upload scanned textbook chapters', text: ['Some lecturers upload whole scanned chapters of textbooks, which may break publishers’ copyright.'] },
];

export const pages = [
  {
    title: 'Remote proctoring pilot: retro',
    html: `<p><strong>Retro, 7 July 2023.</strong> Facilitator: Grace Nyarko.</p>
<h2>What happened</h2><p>Two partner universities ran mid-semester exams with webcam proctoring from April to June 2023.</p>
<h2>Why we stopped</h2><ul>
<li><strong>False flags.</strong> 400 students were flagged, most because their video froze on a weak connection.</li>
<li><strong>Complaints.</strong> Both universities received formal complaints from students and the student union.</li>
<li><strong>Data protection.</strong> Nobody could say how long we may keep the recordings or who may watch them.</li></ul>
<h2>What we would need to try again</h2><p>A way to tell a frozen video from cheating, the data protection review finished, and the partner universities’ consent.</p>`,
  },
  {
    title: 'DEC-22: No webcam proctoring; use open-book assessments',
    html: `<p><strong>Decision record.</strong> Decided 20 July 2023 by Dr Kofi Boateng, Academic Director.</p>
<h2>Decision</h2><p>Brightwell will not offer webcam proctoring. Online exams are open-book, timed assessments designed so that looking things up does not help.</p>
<h2>Reasons</h2><p>See "Remote proctoring pilot: retro".</p>
<h2>Revisit when</h2><p>The data protection review of recordings is finished and a pilot shows false flags under 2 percent.</p>`,
  },
  { title: 'Virtual labs: why we stopped', html: '<p><strong>Retro, March 2024.</strong> The lab simulations needed laptops; most of our students study on phones. Revisit if a phone version exists.</p>' },
  { title: 'Student messaging rules', html: '<p>Messages to students go out between 7 am and 9 pm local time. Partner universities approve any new kind of message.</p>' },
  { title: 'Lecturer onboarding guide', html: '<p>How to upload lectures, build a rubric, release grades and use the analytics dashboard.</p>' },
  { title: 'Low-bandwidth video settings', html: '<p>Lectures are encoded at 240p and audio-only as well as full quality.</p>' },
  { title: 'Exam week runbook', html: '<p>Who is on call, how to extend a deadline, how to reopen an assessment.</p>' },
  { title: 'Partner university list', html: '<p>Seven partner universities in Ghana and Nigeria, with their course leads.</p>' },
  { title: 'Video player release notes 2024', html: '<p>Playback speeds, skip buttons and remembered position shipped in April 2024.</p>' },
  { title: 'Team directory', html: '<p>Dr Kofi Boateng, Academic Director. Yaa Frimpong, Product. Samuel Ofori, Video and Mobile. Grace Nyarko, Assessment. Kwesi Arthur, Payments and Messaging.</p>' },
];
