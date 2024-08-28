import React, { useState, useRef, useEffect } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import { DateTime } from 'luxon';
import rgbHex from 'rgb-hex'

const CarCounter = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [carCount, setCarCount] = useState(0);
  const [model, setModel] = useState(null);
  const carTracker = useRef({});
  const [carColors, setCarColors] = useState([]); // Estado para armazenar as cores dos carros

  useEffect(() => {
    // Carregar o modelo quando o componente for montado
    const loadModel = async () => {
      const loadedModel = await cocoSsd.load();
      setModel(loadedModel);
    };
    loadModel();
  }, []);

  // const handleVideoUpload = (event) => {
  //   const file = event.target.files[0];
  //   const video = videoRef.current;
  //   video.src = URL.createObjectURL(file);
  //   video.play();
  // };

  const hasCrossedLine = (car) => {
    const lineY = canvasRef.current.height / 2; // Linha de contagem no meio do vídeo
    const oldY = car.y;
    const newY = car.latestY;
    return oldY < lineY && newY >= lineY; // Detecta cruzamento da linha
  };

  const generateUniqueId = () => {
    return Math.random().toString(36).substr(2, 9); // Gera um ID aleatório
  };

  const getAverageColor = (context, x, y, width, height) => {
    const imageData = context.getImageData(x, y, width, height);
    const data = imageData.data;
    let r = 0, g = 0, b = 0;

    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }

    const pixelCount = data.length / 4;
    r = Math.floor(r / pixelCount);
    g = Math.floor(g / pixelCount);
    b = Math.floor(b / pixelCount);

    const hex = rgbHex(r, g, b)

    return hex;
  };

  const runDetection = async () => {
    if (!model) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const detect = () => {
      if (!video.paused && !video.ended) {
        model.detect(video).then(predictions => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Desenhar a linha de contagem
          ctx.beginPath();
          ctx.moveTo(0, canvas.height / 2);
          ctx.lineTo(canvas.width, canvas.height / 2);
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 2;
          ctx.stroke();

          predictions.forEach(prediction => {
            if (prediction.class === 'car' || prediction.class === 'truck') {
              const [x, y, width, height] = prediction.bbox;
              const centerX = x + width / 2;
              const centerY = y + height / 2;

              // Desenhar o retângulo de detecção
              ctx.beginPath();
              ctx.rect(x, y + 40, width, height);
              ctx.lineWidth = 2;
              ctx.strokeStyle = 'green';
              ctx.stroke();

              // Capturar a cor média do carro
              const color = getAverageColor(ctx, x, y, width, height);

              // Rastrear carros com base na posição X e Y
              let matched = false;
              for (let id in carTracker.current) {
                let car = carTracker.current[id];
                if (Math.abs(car.x - centerX) < width / 2 && Math.abs(car.y - centerY) < height / 2) {
                  matched = true;
                  car.latestX = centerX;
                  car.latestY = centerY;

                  // Verificar se cruzou a linha
                  if (!car.counted && hasCrossedLine(car)) {
                    setCarCount(prevCount => prevCount + 1);
                    car.counted = true;  // Marcar como contado
                    const date = DateTime.now().toFormat(`hh:mm:ss a`)
                    setCarColors(prevColors => [...prevColors, { color, time: date }]); // Armazenar a cor do carro
                  }

                  car.x = centerX;
                  car.y = centerY;
                  car.lastSeen = video.currentTime;
                  break;
                }
              }

              // Se não encontrou correspondência, adicionar um novo carro ao rastreador
              if (!matched) {
                const newId = generateUniqueId();
                carTracker.current[newId] = {
                  x: centerX,
                  y: centerY,
                  latestX: centerX,
                  latestY: centerY,
                  counted: false,
                  lastSeen: video.currentTime
                };
              }
            }
          });

          // Limpar carros antigos que não foram vistos recentemente
          for (let id in carTracker.current) {
            let car = carTracker.current[id];
            if (video.currentTime - car.lastSeen > 1) {
              delete carTracker.current[id];
            }
          }
        });

        requestAnimationFrame(detect);
      }


    };
    detect();
  };


  return (
    <main className="flex flex-col h-screen justify-center items-center w-screen">
      <div className="flex flex-col border w-full justify-center items-center w-max-[1200px]">

        <div className="flex flex-row gap-5 p-10">
          <div className='p-10 flex flex-col gap-5'>
            <h1 className="text-2xl font-bold">Cars counter</h1>
            {/* <input type="file" onChange={handleVideoUpload} accept="video/mp4" /> */}
            <label>Orignal video </label>
            <video ref={videoRef} src="cars.mp4" width="640" height="480" controls onPlay={runDetection} />
          </div>
          <div>
            <label>Detected cars: <span>{carCount}</span></label>
            <canvas ref={canvasRef} width="640" height="480"></canvas>
          </div>


          {
            carColors.length > 0 && (
              <div>
                <h2>Color / hour:</h2>
                <table className="text-center min-w-72 w-full">
                  <thead className="bg-black flex text-white w-full">
                    <tr className="flex w-full mb-4">
                      <th className="p-4 w-1/4">Position</th>

                      <th className="p-4 w-1/4">Color</th>
                      <th className="p-4 w-1/4">Time</th>
                    </tr>
                  </thead>
                  <tbody className="bg-grey-light h-96 flex flex-col  overflow-y-scroll w-full" >
                    {
                      carColors.map((element, index) => (
                        <tr className="min-w-full table-row" key={index}>
                          <td className="p-4 w-1/4">{index + 1}</td>
                          <td className="p-4 w-1/4">{`#${element.color}`}</td>
                          <td className="p-4 w-1/4">{element.time}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            )
          }

        </div>
      </div>

    </main>

  );
};

export default CarCounter;
