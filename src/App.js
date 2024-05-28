import React, { useState, useEffect } from 'react';
import { FaPlus, FaEye, FaCheck, FaTrash, FaEdit, FaSignOutAlt, FaFileWord, FaFileAlt, FaCalendar, FaPlay, FaReadme, FaArrowLeft, FaCheckDouble, FaClock } from 'react-icons/fa';
import './App.css';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, addDoc, doc, updateDoc, limit, and } from 'firebase/firestore';
import { Readability } from '@mozilla/readability';
import { saveAs } from 'file-saver';
import * as docx from 'docx';
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk';

const speechKey = process.env.REACT_APP_AZURE_SPEECH_API_KEY;
const serviceRegion = 'eastus';
const voiceName = 'en-US-AvaNeural';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
var articles = '';

function App() {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [editTask, setEditTask] = useState(null);
  const [editTaskText, setEditTaskText] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [readerMode, setReaderMode] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const todoCollection = collection(db, 'todo');
      const urlParams = new URLSearchParams(window.location.search);
      const limitParam = urlParams.get('limit');
      const limitValue = limitParam ? parseInt(limitParam) : 6;
      //print limit value
      console.log('limit value: ', limitValue);
      const q = query(todoCollection, where('userId', '==', user.uid), where('status', '==', false), orderBy('createdDate', 'desc'), limit(limitValue));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const tasksData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        articles += tasksData.map((task) => task.task).join(' ');
        setTasks(tasksData);
      });

      return () => unsubscribe();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      const todoCollection = collection(db, 'todo');
      const urlParams = new URLSearchParams(window.location.search);
      const limitParam = urlParams.get('limit');
      const limitValue = limitParam ? parseInt(limitParam) : 6;
      //print limit value
      console.log('limit value: ', limitValue);
      const q = query(todoCollection, where('userId', '==', user.uid), where('status', '==', true), orderBy('createdDate', 'desc'), limit(limitValue));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const completedTasksData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setCompletedTasks(completedTasksData);
      });

      return () => unsubscribe();
    }
  }, [user]);

  useEffect(() => {
    if (showCompleted) {
      handleShowCompleted();
    }
  }, [showCompleted]);

  const handleSignIn = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider);
  };

  const handleSignOut = () => {
    auth.signOut();
  };


  const splitMessage = (msg, chunkSize = 4000) => {
    const chunks = [];
    for (let i = 0; i < msg.length; i += chunkSize) {
      chunks.push(msg.substring(i, i + chunkSize));
    }
    return chunks;
  };

  const synthesizeSpeech = async () => {
    const speechConfig = speechsdk.SpeechConfig.fromSubscription(speechKey, serviceRegion);
    speechConfig.speechSynthesisVoiceName = voiceName;

    const audioConfig = speechsdk.AudioConfig.fromDefaultSpeakerOutput();
    const speechSynthesizer = new speechsdk.SpeechSynthesizer(speechConfig, audioConfig);

    const chunks = splitMessage(articles);
    for (const chunk of chunks) {
      try {
        const result = await speechSynthesizer.speakTextAsync(chunk);
        if (result.reason === speechsdk.ResultReason.SynthesizingAudioCompleted) {
          console.log(`Speech synthesized to speaker for text: [${chunk}]`);
        } else if (result.reason === speechsdk.ResultReason.Canceled) {
          const cancellationDetails = speechsdk.SpeechSynthesisCancellationDetails.fromResult(result);
          console.error(`Speech synthesis canceled: ${cancellationDetails.reason}`);
          if (cancellationDetails.reason === speechsdk.CancellationReason.Error) {
            console.error(`Error details: ${cancellationDetails.errorDetails}`);
          }
        }
      } catch (error) {
        console.error(`Error synthesizing speech: ${error}`);
      }
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (newTask.trim() !== '') {
      let textresponse = '';
      if (newTask.substring(0, 4) == 'http') {
        const urlWithoutProtocol = newTask.replace(/^https?:\/\//, '');
        const response = await fetch('https://us-central1-reviewtext-ad5c6.cloudfunctions.net/function-9?url=' + newTask);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        // Initialize Readability with the document
        const reader = new Readability(doc);
        const article = reader.parse();
        try {
          textresponse = article.title + ' . ' + article.textContent;
        }
        catch (error) {
          textresponse = error + '   Could not parse url : ' + newTask;
        }
      }
      else {
        textresponse = newTask;
      }

      await addDoc(collection(db, 'todo'), {
        task: textresponse,
        status: false,
        userId: user.uid,
        createdDate: new Date(),
        uemail: user.email
      });
      setNewTask('');
    }
  };

  const handleUpdateTask = async (taskId, newTaskText) => {
    if (newTaskText.trim() !== '') {
      const taskDocRef = doc(db, 'todo', taskId);
      await updateDoc(taskDocRef, {
        task: newTaskText,
      });
    }
  };


  const handleToggleStatus = async (taskId, status) => {
    const taskDocRef = doc(db, 'todo', taskId);
    await updateDoc(taskDocRef, {
      status: !status,
    });
  };

  const generateDocx = async () => {
    const doc = new docx.Document({
      sections: [{
        properties: {},
        children: [
          new docx.Paragraph({
            children: [
              new docx.TextRun(articles),
            ],
          }),
        ],
      }]
    });

    docx.Packer.toBlob(doc).then(blob => {
      console.log(blob);
      const now = new Date();
      const date = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      const time = `${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;
      const dateTime = `${date}__${time}`;
      saveAs(blob, dateTime + "_" + ".docx");
      console.log("Document created successfully");
    });
  };


  const generateText = async () => {
    const blob = new Blob([articles], { type: "text/plain;charset=utf-8" });
    const now = new Date();
    const date = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const time = `${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;
    const dateTime = `${date}__${time}`;
    saveAs(blob, dateTime + ".txt");
  }

  const handleShowCompleted = () => {
    const todoCollection = collection(db, 'todo');
    const urlParams = new URLSearchParams(window.location.search);
    const limitParam = urlParams.get('limit');
    const limitValue = limitParam ? parseInt(limitParam) : 6;
    const q = query(todoCollection, where('userId', '==', user.uid), where('status', '==', true), orderBy('createdDate', 'desc'), limit(limitValue));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const completedTasksData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setCompletedTasks(completedTasksData);
    });

    return () => unsubscribe();
  };
  const handleReaderMode = () => {
    setReaderMode(true);
  };

  const handleBack = () => {
    setReaderMode(false);
  };

  return (
    <div className="app">
      {readerMode ? (
          <div>
            <button onClick={handleBack}><FaArrowLeft /></button>
            <p>{articles}</p>
          </div>
        ) : (
        <div>
          <button className="signoutbutton" onClick={handleSignOut}>
            <FaSignOutAlt />
          </button>
          <button onClick={generateDocx}><FaFileWord /></button>
          <button className='textbutton' onClick={generateText}><FaFileAlt /></button>
          <button onClick={synthesizeSpeech}><img src="speak.png" style={{ width: '22px', height: '18px' }} /></button>
          <button onClick={handleReaderMode}><FaReadme /></button>
          <form onSubmit={handleAddTask}>
            <input
              className="inputtextbox"
              type="text"
              placeholder=""
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Shift') { handleAddTask(e); } }}
              autoFocus
            />
            <button className="addbutton" type="submit">
              <FaPlus />
            </button>
          </form>
          <ul>
            {tasks
              .filter((task) => !task.status)
              .map((task) => (
                <li key={task.id}>
                  {editTask === task.id ? (
                    <form onSubmit={handleUpdateTask}>
                      <input
                        type="text"
                        value={editTaskText}
                        onChange={(e) => setEditTaskText(e.target.value)}
                      />
                      <button type="submit">
                        <FaCheck />
                      </button>
                    </form>
                  ) : (
                    <>
                      <button className='markcompletebutton' onClick={() => handleToggleStatus(task.id, task.status)}>
                        <FaCheck />
                      </button>
                      <span>{task.task}</span>

                    </>
                  )}
                </li>
              ))}
          </ul>
          <button className='showcompletedbutton' onClick={() => setShowCompleted(!showCompleted)}>
            <FaEye /> {showCompleted ? 'Hide' : 'Show'} Completed Tasks
          </button>
          {showCompleted && (
            <div>
              <h2>Completed Tasks</h2>
              <ul>
                {completedTasks
                  .filter((task) => task.status)
                  .map((task) => (
                    <li key={task.id} className="completed">
                      <button onClick={() => handleToggleStatus(task.id, task.status)}>
                        <FaCheck />
                      </button>
                      {task.task}
                    </li>
                  ))}
              </ul>
              <div style={{ marginBottom: '110px' }}></div>
            </div>
          )}
        </div>
      ) }
      {!user && <button onClick={handleSignIn}>Sign In with Google</button>}
    </div>
  );
}

export default App;