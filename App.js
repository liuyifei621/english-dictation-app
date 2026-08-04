import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { StatusBar } from 'expo-status-bar';
import { parseVocabularyFileText } from './src/parser';
import { findEnglishAudio } from './src/pronunciation';

const sample = [
  { word: 'ability', pos: 'n.', meaning: '能力；才能' },
  { word: 'confidence', pos: 'n.', meaning: '信任；自信' },
  { word: 'outstanding', pos: 'adj.', meaning: '杰出的；未解决的' },
  { word: 'suburb', pos: 'n.', meaning: '郊区' },
];
const EXTRACTION_API_URL = process.env.EXPO_PUBLIC_EXTRACTION_API_URL || 'https://english-dictation-app.onrender.com/extract';

export default function App() {
  const [entries, setEntries] = useState(sample);
  const [sourceName, setSourceName] = useState('示例词库');
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState('cn');
  const [order, setOrder] = useState('sequence');
  const [seconds, setSeconds] = useState('3');
  const [repeatCount, setRepeatCount] = useState(1);
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [showAllAnswers, setShowAllAnswers] = useState(false);
  const [sessionEntries, setSessionEntries] = useState(sample);
  const timer = useRef(null);
  const secondsRef = useRef(seconds);
  const activeRef = useRef(false);
  const soundRef = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem('english-dictation:last-library').then((value) => {
      if (value) {
        const saved = JSON.parse(value);
        if (saved.entries?.length) setEntries(saved.entries);
        if (saved.sourceName) setSourceName(saved.sourceName);
      }
    }).catch(() => {}).finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated && entries.length) AsyncStorage.setItem('english-dictation:last-library', JSON.stringify({ entries, sourceName })).catch(() => {});
  }, [entries, sourceName, hydrated]);

  const current = sessionEntries[index] || entries[0] || sample[0];
  const shownPrompt = mode === 'cn' ? `${current.meaning}` : current.word;

  useEffect(() => { secondsRef.current = seconds; }, [seconds]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); activeRef.current = false; Speech.stop(); if (Platform.OS === 'web') window.speechSynthesis?.cancel(); soundRef.current?.unloadAsync(); }, []);

  const speakRepeated = (entry, done) => {
    const text = mode === 'cn' ? entry.meaning : entry.word;
    let count = 0;
    const speakOnce = (onDone) => {
      let finished = false;
      const finish = () => { if (finished) return; finished = true; onDone?.(); };
      const fallbackMs = Math.max(1800, Math.min(6000, text.length * 220));
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
        const utterance = new window.SpeechSynthesisUtterance(text);
        utterance.lang = mode === 'cn' ? 'zh-CN' : 'en-US';
        utterance.rate = 0.82;
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find((voice) => voice.lang?.toLowerCase().startsWith(mode === 'cn' ? 'zh' : 'en'));
        if (preferred) utterance.voice = preferred;
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.speak(utterance);
        setTimeout(finish, fallbackMs);
        return;
      }
      Speech.speak(text, { language: mode === 'cn' ? 'zh-CN' : 'en-US', rate: 0.82, onDone: finish, onError: finish });
      setTimeout(finish, fallbackMs);
    };
    const play = () => {
      if (!activeRef.current && done) return;
      count += 1;
      if (mode === 'cn') { speakOnce(() => count < repeatCount ? play() : done?.()); return; }
      if (Platform.OS === 'web') {
        findEnglishAudio(entry.word).then((url) => {
          if (!url || typeof window === 'undefined' || !window.Audio) { speakOnce(() => count < repeatCount ? play() : done?.()); return; }
          const audio = new window.Audio(url);
          let finished = false;
          const fallback = () => { if (finished) return; finished = true; audio.onerror = null; audio.onended = null; speakOnce(() => count < repeatCount ? play() : done?.()); };
          audio.onended = () => { if (finished) return; finished = true; count < repeatCount ? play() : done?.(); };
          audio.onerror = fallback;
          audio.play().catch(fallback);
          setTimeout(fallback, 7000);
        }).catch(() => speakOnce(() => count < repeatCount ? play() : done?.()));
        return;
      }
      findEnglishAudio(entry.word).then(async (url) => {
        if (!url) {
          speakOnce(() => count < repeatCount ? play() : done?.());
          return;
        }
        soundRef.current?.unloadAsync();
        const result = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
        soundRef.current = result.sound;
        result.sound.setOnPlaybackStatusUpdate((status) => {
          if (status.didJustFinish) { result.sound.unloadAsync(); soundRef.current = null; if (!activeRef.current) return; count < repeatCount ? play() : done?.(); }
        });
      });
    };
    play();
  };

  const scheduleNext = (list, nextIndex) => {
    timer.current = setTimeout(() => {
      setIndex(nextIndex);
      setAnswerVisible(false);
      speakRepeated(list[nextIndex], () => scheduleNext(list, (nextIndex + 1) % list.length));
      }, Math.max(0, Number(secondsRef.current) || 0) * 1000);
  };

  const start = () => {
    if (!entries.length) return;
    const list = order === 'sequence' ? entries : [...entries].sort(() => Math.random() - 0.5);
    setSessionEntries(list); setIndex(0); setRunning(true); setAnswerVisible(false); setShowAllAnswers(false); activeRef.current = true;
    speakRepeated(list[0], () => scheduleNext(list, 1 % list.length));
  };

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    Speech.stop(); if (Platform.OS === 'web') window.speechSynthesis?.cancel(); activeRef.current = false; soundRef.current?.stopAsync().catch(() => {}); soundRef.current?.unloadAsync().catch(() => {}); soundRef.current = null; setRunning(false); setAnswerVisible(true); setShowAllAnswers(true);
  };

  /* 保留一个显式的手动推进入口，便于后续增加“下一个”按钮。 */
  const next = () => {
    if (!sessionEntries.length) return;
    setAnswerVisible(false);
    const nextIndex = (index + 1) % sessionEntries.length;
    setIndex(nextIndex);
    speakRepeated(sessionEntries[nextIndex], () => {});
  };

  const testVoice = () => {
    const text = mode === 'cn' ? '这是中文语音测试' : 'This is an English voice test';
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis && window.SpeechSynthesisUtterance) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = mode === 'cn' ? 'zh-CN' : 'en-US';
      utterance.rate = 0.82;
      utterance.onerror = () => Alert.alert('语音不可用', '请检查电脑音量、浏览器是否静音，并使用 Chrome 或 Edge 打开。');
      window.speechSynthesis.speak(utterance);
      return;
    }
    if (Platform.OS === 'web') Alert.alert('浏览器不支持语音', '请改用 Chrome 或 Edge 打开网页版。');
    else Speech.speak(text, { language: mode === 'cn' ? 'zh-CN' : 'en-US', rate: 0.82 });
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/*'], copyToCacheDirectory: true });
    if (result.canceled) return;
    const file = result.assets[0];
    setSourceName(file.name);
    if (file.mimeType === 'text/plain' || /\\.txt$/i.test(file.name)) {
      try {
        const text = await new File(file.uri).text();
        const parsed = parseVocabularyFileText(text);
        setEntries(parsed); setIndex(0); setAnswerVisible(false);
        Alert.alert('导入成功', `已识别 ${parsed.length} 个不同单词`);
      } catch (error) { Alert.alert('识别失败', error.message); }
    } else {
      try {
        const body = new FormData();
        body.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' });
        const response = await fetch(EXTRACTION_API_URL, { method: 'POST', body });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || '文档识别失败');
        if (!payload.entries?.length) throw new Error('没有识别到词条');
        setEntries(payload.entries); setIndex(0); setAnswerVisible(false);
        Alert.alert('导入成功', `已识别 ${payload.count} 个不同单词`);
      } catch (error) {
        Alert.alert('识别失败', `请确认识别服务已启动。\n${error.message}`);
      }
    }
  };

  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.eyebrow}>ENGLISH DICTATION</Text><Text style={styles.title}>英语默写</Text>
    <Text style={styles.subtitle}>当前词库：{sourceName} · 共 {entries.length} 个单词 · 上传后按自己的节奏听写。</Text>
    <Pressable style={styles.upload} onPress={pickFile}><Text style={styles.uploadIcon}>＋</Text><View><Text style={styles.uploadTitle}>上传词汇文档</Text><Text style={styles.uploadHint}>支持 Word、PDF、图片</Text></View></Pressable>
    <View style={styles.card}><Text style={styles.sectionLabel}>默写模式</Text><View style={styles.segment}><Pressable onPress={() => setMode('cn')} style={[styles.segmentItem, mode === 'cn' && styles.segmentActive]}><Text style={mode === 'cn' ? styles.segmentTextActive : styles.segmentText}>中文 → 英文</Text></Pressable><Pressable onPress={() => setMode('en')} style={[styles.segmentItem, mode === 'en' && styles.segmentActive]}><Text style={mode === 'en' ? styles.segmentTextActive : styles.segmentText}>英文 → 中文</Text></Pressable></View>
      <Text style={styles.sectionLabel}>出题顺序</Text><View style={styles.segment}><Pressable onPress={() => setOrder('sequence')} style={[styles.segmentItem, order === 'sequence' && styles.segmentActive]}><Text style={order === 'sequence' ? styles.segmentTextActive : styles.segmentText}>顺序版</Text></Pressable><Pressable onPress={() => setOrder('random')} style={[styles.segmentItem, order === 'random' && styles.segmentActive]}><Text style={order === 'random' ? styles.segmentTextActive : styles.segmentText}>乱序版</Text></Pressable></View>
      <View style={styles.row}><Text style={styles.sectionLabel}>停顿时间</Text><View style={styles.seconds}><TextInput value={seconds} onChangeText={setSeconds} keyboardType="number-pad" style={styles.secondsInput}/><Text style={styles.secondsUnit}>秒</Text></View></View>
      <Text style={styles.sectionLabel}>每个词播报次数</Text><View style={styles.segment}>{[1,2,3,4].map((count) => <Pressable key={count} onPress={() => setRepeatCount(count)} style={[styles.segmentItem, repeatCount === count && styles.segmentActive]}><Text style={repeatCount === count ? styles.segmentTextActive : styles.segmentText}>{count}遍</Text></Pressable>)}</View>
    </View>
    <View style={styles.practice}><View style={styles.practiceTop}><Text style={styles.practiceLabel}>{running ? '正在默写' : '准备开始'}</Text><Text style={styles.counter}>{index + 1} / {entries.length}</Text></View><Text style={styles.prompt}>{running ? shownPrompt : '点击开始，听题后默写'}</Text>{showAllAnswers ? <View style={styles.answerList}>{sessionEntries.map((entry, answerIndex) => <View key={`${entry.word}-${answerIndex}`} style={styles.answer}><Text style={styles.answerWord}>{answerIndex + 1}. {entry.word}</Text><Text style={styles.answerMeta}>{entry.pos}  {entry.meaning}</Text></View>)}</View> : answerVisible && <View style={styles.answer}><Text style={styles.answerWord}>{current.word}</Text><Text style={styles.answerMeta}>{current.pos}  {current.meaning}</Text></View>}<View style={styles.actions}>{running ? <Pressable style={styles.stop} onPress={stop}><Text style={styles.stopText}>停止并显示全部答案</Text></Pressable> : <Pressable style={styles.start} onPress={start}><Text style={styles.startText}>开始默写</Text></Pressable>}</View></View>
    <Pressable style={styles.voiceTest} onPress={testVoice}><Text style={styles.voiceTestText}>🔊 测试声音</Text></Pressable><Text style={styles.note}>英文发音使用设备英语语音；联网后可接入词典标准音频。</Text>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({safe:{flex:1,backgroundColor:'#F7F8FC'},page:{padding:22,paddingBottom:40},eyebrow:{fontSize:11,letterSpacing:2,color:'#7B7F95',fontWeight:'700',marginTop:12},title:{fontSize:36,fontWeight:'800',color:'#171A2B',marginTop:8},subtitle:{fontSize:15,color:'#73778C',marginTop:8,marginBottom:22},upload:{backgroundColor:'#E9E7FF',borderRadius:20,padding:18,flexDirection:'row',alignItems:'center',marginBottom:16},uploadIcon:{fontSize:30,color:'#5A51D6',marginRight:14},uploadTitle:{fontSize:16,fontWeight:'800',color:'#28225E'},uploadHint:{fontSize:13,color:'#68639A',marginTop:4},card:{backgroundColor:'#FFF',borderRadius:20,padding:18,marginBottom:16},sectionLabel:{fontSize:13,fontWeight:'800',color:'#303346',marginBottom:10},segment:{flexDirection:'row',backgroundColor:'#F1F2F7',borderRadius:12,padding:4,marginBottom:18},segmentItem:{flex:1,paddingVertical:11,alignItems:'center',borderRadius:9},segmentActive:{backgroundColor:'#FFF',shadowColor:'#25284A',shadowOpacity:.08,shadowRadius:5,elevation:2},segmentText:{fontSize:14,color:'#777B8E'},segmentTextActive:{fontSize:14,color:'#433BC2',fontWeight:'800'},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},seconds:{flexDirection:'row',alignItems:'center',backgroundColor:'#F1F2F7',borderRadius:10,paddingHorizontal:10},secondsInput:{width:42,textAlign:'center',fontSize:17,fontWeight:'800',color:'#3933A9',paddingVertical:7},secondsUnit:{color:'#777B8E'},practice:{backgroundColor:'#24264A',borderRadius:24,padding:20,minHeight:230},practiceTop:{flexDirection:'row',justifyContent:'space-between'},practiceLabel:{color:'#AEB1D3',fontSize:13,fontWeight:'700'},counter:{color:'#AEB1D3',fontSize:13},prompt:{color:'#FFF',fontSize:24,fontWeight:'800',textAlign:'center',marginTop:42,minHeight:62},answerList:{maxHeight:360},answer:{backgroundColor:'#373A68',borderRadius:14,padding:13,marginTop:14},answerWord:{color:'#FFF',fontSize:20,fontWeight:'800'},answerMeta:{color:'#C8C9E7',fontSize:14,marginTop:5},actions:{marginTop:20},start:{backgroundColor:'#8078FF',paddingVertical:14,borderRadius:14,alignItems:'center'},startText:{color:'#FFF',fontWeight:'800',fontSize:16},stop:{backgroundColor:'#FFB5A8',paddingVertical:14,borderRadius:14,alignItems:'center'},stopText:{color:'#5B2922',fontWeight:'800',fontSize:16},voiceTest:{backgroundColor:'#FFF',borderRadius:14,paddingVertical:12,alignItems:'center',marginTop:18},voiceTestText:{color:'#433BC2',fontWeight:'800',fontSize:15},note:{fontSize:12,color:'#9296A8',textAlign:'center',marginTop:12,lineHeight:18}});
