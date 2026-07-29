'use client';

import {
  type ElementType,
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { gsap } from 'gsap';

interface TextTypeProps extends HTMLAttributes<HTMLElement> {
  text: string | string[];
  as?: ElementType;
  typingSpeed?: number;
  initialDelay?: number;
  pauseDuration?: number;
  deletingSpeed?: number;
  loop?: boolean;
  showCursor?: boolean;
  hideCursorWhileTyping?: boolean;
  cursorCharacter?: string | ReactNode;
  cursorClassName?: string;
  cursorBlinkDuration?: number;
  variableSpeed?: { min: number; max: number };
}

export function TextType({
  text,
  as: Component = 'span',
  typingSpeed = 48,
  initialDelay = 0,
  pauseDuration = 1200,
  deletingSpeed = 28,
  loop = true,
  className = '',
  showCursor = true,
  hideCursorWhileTyping = false,
  cursorCharacter = '|',
  cursorClassName = '',
  cursorBlinkDuration = 0.5,
  variableSpeed,
  ...props
}: TextTypeProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const cursorRef = useRef<HTMLSpanElement>(null);

  const textArray = useMemo(() => (Array.isArray(text) ? text : [text]), [text]);

  const getRandomSpeed = useCallback(() => {
    if (!variableSpeed) return typingSpeed;
    const { min, max } = variableSpeed;
    return Math.random() * (max - min) + min;
  }, [typingSpeed, variableSpeed]);

  useEffect(() => {
    if (!showCursor || !cursorRef.current) {
      return;
    }

    const tween = gsap.to(cursorRef.current, {
      opacity: 0,
      duration: cursorBlinkDuration,
      repeat: -1,
      yoyo: true,
      ease: 'power2.inOut',
    });

    return () => {
      tween.kill();
    };
  }, [cursorBlinkDuration, showCursor]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const currentText = textArray[currentTextIndex] ?? '';
    const step = () => {
      if (isDeleting) {
        if (displayedText.length === 0) {
          setIsDeleting(false);
          if (!loop && currentTextIndex === textArray.length - 1) return;
          setCurrentTextIndex((prev) => (prev + 1) % textArray.length);
          setCurrentCharIndex(0);
          return;
        }
        timeout = setTimeout(() => {
          setDisplayedText((prev) => prev.slice(0, -1));
          setCurrentCharIndex((prev) => Math.max(0, prev - 1));
        }, deletingSpeed);
        return;
      }

      if (currentCharIndex < currentText.length) {
        timeout = setTimeout(() => {
          setDisplayedText((prev) => prev + currentText[currentCharIndex]);
          setCurrentCharIndex((prev) => prev + 1);
        }, variableSpeed ? getRandomSpeed() : typingSpeed);
        return;
      }

      if (!loop && currentTextIndex === textArray.length - 1) return;
      timeout = setTimeout(() => setIsDeleting(true), pauseDuration);
    };

    if (currentCharIndex === 0 && displayedText === '' && !isDeleting) {
      timeout = setTimeout(step, initialDelay);
    } else {
      step();
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [
    currentCharIndex,
    currentTextIndex,
    deletingSpeed,
    displayedText,
    getRandomSpeed,
    initialDelay,
    isDeleting,
    loop,
    pauseDuration,
    textArray,
    typingSpeed,
    variableSpeed,
  ]);

  const shouldHideCursor =
    hideCursorWhileTyping &&
    (currentCharIndex < (textArray[currentTextIndex]?.length ?? 0) || isDeleting);

  return createElement(
    Component,
    { className, ...props },
    <span>{displayedText}</span>,
    showCursor && (
      <span
        ref={cursorRef}
        className={cursorClassName}
        style={{ visibility: shouldHideCursor ? 'hidden' : 'visible' }}
      >
        {cursorCharacter}
      </span>
    ),
  );
}

